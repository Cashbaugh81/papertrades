import { describe, expect, it } from "vitest";
import { closeInstant, lastCutoff, nyHour } from "@/lib/market";
import { buildIndex } from "@/lib/prices";
import { rowToPortfolio, seriesToBundle, tickersFor, toWeights, type PortfolioRow, type TransactionRow } from "@/lib/rows";
import { settle } from "@/server/settle";
import {
  incrementalStart,
  isFresh,
  needsFullRefetch,
  normaliseTicker,
  parseBars,
} from "@/server/tiingo";

// ---- fixtures ---------------------------------------------------------------

const days = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
const index = buildIndex(
  seriesToBundle([
    { ticker: "SPY", dates: days, closes: [600, 601, 602, 603, 604] },
    // VTI has no close on the 11th (a gap) and arrives as strings, like Postgres numerics.
    { ticker: "VTI", dates: ["2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13"], closes: ["300", "301", "310", "320"] },
  ]),
);

const portfolioRow: PortfolioRow = {
  id: "p1",
  user_id: "u1",
  set_id: "s1",
  slot: 1,
  name: "Mine",
  thesis: "",
  start_date: "2026-11-09",
  created_at: "2026-11-09T15:00:00Z",
};
const setRow = { initial: 1000, weekly: 0 };

let seq = 0;
function txRow(over: Partial<TransactionRow>): TransactionRow {
  seq++;
  return {
    id: `t${seq}`,
    portfolio_id: "p1",
    user_id: "u1",
    kind: "buy",
    ticker: "VTI",
    amount: 100,
    units: null,
    note: null,
    trade_date: "2026-11-09",
    placed_at: null,
    status: "pending",
    filled_on: null,
    fill_price: null,
    fill_units: null,
    fill_amount: null,
    reject_reason: null,
    processed_at: null,
    weights: null,
    created_at: `2026-11-09T15:00:${String(seq).padStart(2, "0")}Z`,
    ...over,
  };
}

/** ISO instant at New York wall-clock hh:00 on `day`. */
const ny = (day: string, hh: number) => new Date(closeInstant(day) + (hh - 16) * 3_600_000).toISOString();

// ---- settle -----------------------------------------------------------------

describe("settle", () => {
  it("fills at the first close after placement, using the ticker's own close", () => {
    // Placed after the close on the 10th; VTI has no close on the 11th, so the
    // fill waits for the 12th rather than using the 10th's known price.
    const t = txRow({ placed_at: ny("2026-11-10", 18), amount: 310 });
    const p = rowToPortfolio(portfolioRow, setRow, [t]);
    const [s] = settle(index, p, new Set([t.id]));
    expect(s).toEqual({
      id: t.id,
      status: "filled",
      filled_on: "2026-11-12",
      fill_price: 310,
      fill_units: 1,
      fill_amount: 310,
    });
  });

  it("leaves an order pending when its close is not in the data yet", () => {
    const t = txRow({ placed_at: ny("2026-11-13", 17) });
    const p = rowToPortfolio(portfolioRow, setRow, [t]);
    expect(settle(index, p, new Set([t.id]))).toEqual([]);
  });

  it("rejects a buy the cash can't fund, at its fill day", () => {
    const t = txRow({ placed_at: ny("2026-11-09", 10), amount: 5000 });
    const p = rowToPortfolio(portfolioRow, setRow, [t]);
    const [s] = settle(index, p, new Set([t.id]));
    expect(s.status).toBe("rejected");
    expect(s.filled_on).toBe("2026-11-09");
    expect(s.status === "rejected" && s.reject_reason).toMatch(/needs \$5000\.00/);
  });

  it("counts earlier fills and deposits when funding a later order", () => {
    const rows = [
      txRow({ placed_at: ny("2026-11-09", 10), amount: 900, status: "filled", filled_on: "2026-11-09", fill_price: 300, fill_units: 3, fill_amount: 900 }),
      txRow({ kind: "deposit", ticker: null, placed_at: ny("2026-11-10", 9), amount: 500, status: "filled" }),
      txRow({ placed_at: ny("2026-11-12", 10), amount: 550 }),
    ];
    const p = rowToPortfolio(portfolioRow, setRow, rows);
    const out = settle(index, p, new Set([rows[2].id]));
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("filled"); // 100 left + 500 deposited = 600 >= 550
  });

  it("only reports the ids it was asked about", () => {
    const a = txRow({ placed_at: ny("2026-11-09", 10), amount: 100 });
    const b = txRow({ placed_at: ny("2026-11-09", 11), amount: 100 });
    const p = rowToPortfolio(portfolioRow, setRow, [a, b]);
    expect(settle(index, p, new Set([b.id])).map((s) => s.id)).toEqual([b.id]);
  });
});

describe("rows", () => {
  it("always includes the calendar anchor and every mix's tickers", () => {
    const p = rowToPortfolio(portfolioRow, setRow, [
      txRow({ kind: "rebalance", ticker: null, amount: null, weights: { BND: 0.4, VTI: 0.6 } }),
      txRow({ ticker: "QQQ" }),
    ]);
    expect(tickersFor(p)).toEqual(["BND", "QQQ", "SPY", "VTI"]);
  });

  it("takes amounts from the set and drops junk in a mix", () => {
    const p = rowToPortfolio(portfolioRow, { initial: 500, weekly: 25 }, []);
    expect([p.initial, p.weekly]).toEqual([500, 25]);
    expect(toWeights({ VTI: 1, BAD: "x", NEG: -1 })).toEqual({ VTI: 1 });
    expect(toWeights([1, 2])).toBeUndefined();
  });

  it("settles a mix change with the day and the money moved", () => {
    const first = txRow({ kind: "rebalance", ticker: null, amount: null, weights: { SPY: 1 }, placed_at: ny("2026-11-09", 10) });
    const p = rowToPortfolio(portfolioRow, setRow, [first]);
    expect(settle(index, p, new Set([first.id]))).toEqual([
      { id: first.id, status: "filled", filled_on: "2026-11-09", fill_amount: 1000 },
    ]);
  });
});

// ---- tiingo -----------------------------------------------------------------

describe("tiingo", () => {
  it("normalises tickers and rejects junk", () => {
    expect(normaliseTicker(" brk-b ")).toBe("BRK-B");
    expect(normaliseTicker("VTI")).toBe("VTI");
    expect(normaliseTicker("../etc")).toBeUndefined();
    expect(normaliseTicker("")).toBeUndefined();
    expect(normaliseTicker("ABCDEFGHIJKLM")).toBeUndefined();
  });

  it("parses, sorts and de-duplicates bars, keeping adjClose", () => {
    const bars = parseBars([
      { date: "2026-11-12T00:00:00.000Z", close: 99, adjClose: 98.5 },
      { date: "2026-11-11T00:00:00.000Z", close: 97, adjClose: 96.5 },
      { date: "2026-11-12T00:00:00.000Z", close: 99, adjClose: 98.6 },
      { date: "bad", adjClose: 1 },
      { date: "2026-11-10T00:00:00.000Z", adjClose: 0 },
    ]);
    expect(bars).toEqual([
      { date: "2026-11-11", adjClose: 96.5 },
      { date: "2026-11-12", adjClose: 98.6 },
    ]);
    expect(() => parseBars({ detail: "Not found." })).toThrow();
  });

  it("starts incremental fetches ten days back", () => {
    expect(incrementalStart("2026-11-12")).toBe("2026-11-02");
  });

  it("detects a re-adjusted history", () => {
    const stored = new Map([["2026-11-10", 100], ["2026-11-11", 101]]);
    expect(needsFullRefetch(stored, [{ date: "2026-11-11", adjClose: 101 }, { date: "2026-11-12", adjClose: 102 }])).toBe(false);
    expect(needsFullRefetch(stored, [{ date: "2026-11-11", adjClose: 100.5 }, { date: "2026-11-12", adjClose: 102 }])).toBe(true);
    expect(needsFullRefetch(stored, [{ date: "2026-11-12", adjClose: 102 }])).toBe(true); // no overlap: can't tell
  });

  it("decides freshness by status and the publish cutoff", () => {
    const now = Date.parse("2026-11-13T20:00:00Z"); // 15:00 New York, Friday
    const cutoff = lastCutoff(now); // Thursday 17:00 New York
    expect(new Date(cutoff).toISOString()).toBe("2026-11-12T22:00:00.000Z");
    expect(isFresh(undefined, now, cutoff)).toBe(false);
    // Has Thursday's close: fresh.
    expect(isFresh({ status: "ok", fetched_at: "2026-11-12T23:00:00Z", last_date: "2026-11-12" }, now, cutoff)).toBe(true);
    // Checked before the cutoff: stale.
    expect(isFresh({ status: "ok", fetched_at: "2026-11-12T21:00:00Z", last_date: "2026-11-11" }, now, cutoff)).toBe(false);
    expect(isFresh({ status: "not_found", fetched_at: "2026-11-13T00:00:00Z" }, now, cutoff)).toBe(true);
    expect(isFresh({ status: "error", fetched_at: "2026-11-13T18:00:00Z" }, now, cutoff)).toBe(false);
  });

  it("retries a close Tiingo didn't have yet, for four hours after the cutoff", () => {
    const cutoff = Date.parse("2026-11-12T22:00:00Z"); // Thursday 17:00 New York
    const at = (iso: string) => Date.parse(iso);
    const late = (fetched: string) => ({ status: "ok", fetched_at: fetched, last_date: "2026-11-11" });
    // Checked at 17:00 without Thursday's close: wait 45 minutes, then retry.
    expect(isFresh(late("2026-11-12T22:00:30Z"), at("2026-11-12T22:30:00Z"), cutoff)).toBe(true);
    expect(isFresh(late("2026-11-12T22:00:30Z"), at("2026-11-12T23:00:00Z"), cutoff)).toBe(false);
    // Still missing after the 21:00 check (holiday or delisted): stop until tomorrow.
    expect(isFresh(late("2026-11-13T02:01:00Z"), at("2026-11-13T03:00:00Z"), cutoff)).toBe(true);
  });

  it("moves the cutoff to today once 17:00 New York has passed, in summer time too", () => {
    expect(new Date(lastCutoff(Date.parse("2026-07-01T21:30:00Z"))).toISOString()).toBe("2026-07-01T21:00:00.000Z");
    expect(new Date(lastCutoff(Date.parse("2026-07-01T20:30:00Z"))).toISOString()).toBe("2026-06-30T21:00:00.000Z");
  });

  it("skips weekends: Saturday and Sunday still point at Friday's close", () => {
    const friday = "2026-11-13T22:00:00.000Z";
    expect(new Date(lastCutoff(Date.parse("2026-11-14T23:00:00Z"))).toISOString()).toBe(friday); // Saturday evening
    expect(new Date(lastCutoff(Date.parse("2026-11-16T15:00:00Z"))).toISOString()).toBe(friday); // Monday morning
    expect(new Date(lastCutoff(Date.parse("2026-11-16T22:30:00Z"))).toISOString()).toBe("2026-11-16T22:00:00.000Z");
  });

  it("knows the New York hour across daylight saving", () => {
    expect(nyHour(Date.parse("2026-11-13T22:00:00Z"))).toBe(17); // EST
    expect(nyHour(Date.parse("2026-07-01T21:00:00Z"))).toBe(17); // EDT
  });
});
