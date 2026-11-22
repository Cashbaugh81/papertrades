import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeState, heldOverAYear, taxOn } from "@/lib/ledger";
import { closeInstant, nyDate } from "@/lib/market";
import { buildIndex } from "@/lib/prices";
import type { Portfolio, PriceBundle, Tx } from "@/lib/types";

// ---- fixture: weekdays from 2024-01-01; AAA steps 100 -> 110 on day 120 ----
const dates: string[] = [];
const a: number[] = [];
const b: number[] = [];
{
  let d = new Date("2024-01-01T00:00:00Z");
  while (dates.length < 240) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const n = dates.length;
      dates.push(d.toISOString().slice(0, 10));
      a.push(n < 120 ? 100 : 110);
      b.push(50);
    }
    d = new Date(d.getTime() + 86_400_000);
  }
}
const index = buildIndex({
  generated: dates[dates.length - 1],
  source: "fixture",
  series: { AAA: { dates, closes: a }, BBB: { dates, closes: b } },
} satisfies PriceBundle);
const last = index.lastDate;

function pf(over: Partial<Portfolio> = {}): Portfolio {
  return {
    id: "p",
    name: "Test",
    thesis: "",
    startDate: dates[0],
    initial: 10_000,
    monthly: 0,
    tx: [],
    ...over,
  };
}

/** An ISO instant at New York wall-clock `hh:mm` on `day`. */
function nyTime(day: string, hh: number, mm = 0): string {
  const close = closeInstant(day); // 16:00 NY
  return new Date(close + ((hh - 16) * 60 + mm) * 60_000).toISOString();
}

function order(kind: "buy" | "sell", day: string, hh: number, amount: number, extra: Partial<Tx> = {}): Tx {
  const placedAt = nyTime(day, hh);
  return { id: `${kind}-${day}-${hh}`, kind, date: day, placedAt, ticker: "AAA", amount, ...extra };
}

describe("market clock", () => {
  it("puts the close at 16:00 New York in both summer and winter", () => {
    expect(new Date(closeInstant("2026-07-01")).toISOString()).toBe("2026-07-01T20:00:00.000Z");
    expect(new Date(closeInstant("2026-01-05")).toISOString()).toBe("2026-01-05T21:00:00.000Z");
  });
  it("gives the New York date, not the UTC date, late in the evening", () => {
    expect(nyDate(Date.parse("2026-11-13T03:00:00Z"))).toBe("2026-11-12");
  });
});

describe("order fills", () => {
  const d = dates;

  it("an order placed before the close fills at that day's close", () => {
    const s = computeState(index, pf({ tx: [order("buy", d[119], 10, 1_000)] }), last);
    const f = Object.values(s.fills)[0];
    expect(f.date).toBe(d[119]);
    expect(f.price).toBe(100);
  });

  it("an order placed after the close fills at the next day's close, not the one already known", () => {
    const s = computeState(index, pf({ tx: [order("buy", d[119], 17, 1_000)] }), last);
    const f = Object.values(s.fills)[0];
    expect(f.date).toBe(d[120]);
    expect(f.price).toBe(110);
    expect(f.units).toBeCloseTo(1_000 / 110, 9);
  });

  it("an order placed exactly at the close waits for the next one", () => {
    const s = computeState(index, pf({ tx: [order("buy", d[119], 16, 1_000)] }), last);
    expect(Object.values(s.fills)[0].date).toBe(d[120]);
  });

  it("a weekend order fills at Monday's close", () => {
    // d[4] is Friday 2024-01-05; Saturday is 2024-01-06.
    const tx: Tx = { id: "w", kind: "buy", date: "2024-01-06", placedAt: "2024-01-06T15:00:00Z", ticker: "AAA", amount: 500 };
    const s = computeState(index, pf({ tx: [tx] }), last);
    expect(s.fills.w.date).toBe("2024-01-08");
  });

  it("ignores a price stored on the order", () => {
    const s = computeState(index, pf({ tx: [order("buy", d[119], 17, 1_000, { price: 1 })] }), last);
    expect(Object.values(s.fills)[0].price).toBe(110);
  });

  it("never falls back to an older close when the ticker has a gap", () => {
    const gapped = buildIndex({
      generated: "",
      source: "gap",
      series: {
        AAA: { dates: [dates[0], dates[1], dates[3]], closes: [100, 101, 130] },
        BBB: { dates: dates.slice(0, 4), closes: [50, 50, 50, 50] },
      },
    });
    const s = computeState(gapped, pf({ tx: [order("buy", dates[1], 17, 1_000)] }), dates[3]);
    const f = Object.values(s.fills)[0];
    expect(f.date).toBe(dates[3]);
    expect(f.price).toBe(130);
  });

  it("an order whose close is not in the data yet stays pending and reserves cash", () => {
    const s = computeState(index, pf({ tx: [order("buy", last, 17, 4_000)] }), last);
    expect(s.fills).toEqual({});
    expect(s.pending).toHaveLength(1);
    expect(s.cash).toBe(10_000);
    expect(s.availableCash).toBe(6_000);
    expect(s.value).toBe(10_000);
  });

  it("a portfolio started after the last price day is all cash with its orders pending", () => {
    const s = computeState(index, pf({ startDate: "2099-01-01", tx: [order("buy", last, 17, 4_000)] }), last);
    expect(s.dates).toEqual([]);
    expect(s.value).toBe(10_000);
    expect(s.invested).toBe(10_000);
    expect(s.pending).toHaveLength(1);
    expect(s.availableCash).toBe(6_000);
  });

  it("a dollar sell fills at the sell-day close and is capped at what is held", () => {
    const s = computeState(
      index,
      pf({ tx: [order("buy", d[0], 10, 5_000), order("sell", d[150], 10, 99_999)] }),
      last,
    );
    expect(s.holdings).toHaveLength(0);
    expect(s.cash).toBeCloseTo(10_500, 6); // 50 units * 110 + 5000 cash
  });
});

describe("ledger invariants (ported from checks/ledger.check.ts)", () => {
  const legacyBuy: Tx = { id: "t1", kind: "buy", date: dates[0], ticker: "AAA", amount: 5_000 };

  it("values a simple buy", () => {
    const s = computeState(index, pf({ tx: [legacyBuy] }), last);
    expect(s.rejected).toEqual([]);
    expect(s.invested).toBeCloseTo(10_000);
    expect(s.cash).toBeCloseTo(5_000);
    expect(s.value).toBeCloseTo(10_500);
    expect(s.returnOnInvested).toBeCloseTo(0.05);
  });

  it("rejects an unfundable buy rather than clamping it", () => {
    const s = computeState(index, pf({ tx: [{ ...legacyBuy, amount: 25_000 }] }), last);
    expect(s.rejected).toHaveLength(1);
    expect(s.cash).toBe(10_000);
    expect(s.value).toBe(10_000);
  });

  it("selling more than held does not invent cash", () => {
    const s = computeState(
      index,
      pf({ tx: [legacyBuy, { id: "t4", kind: "sell", date: dates[120], ticker: "AAA", units: 500 }] }),
      last,
    );
    expect(s.holdings).toHaveLength(0);
    expect(s.cash).toBeCloseTo(10_500);
  });

  it("counts contributions as invested, not as return", () => {
    const s = computeState(
      index,
      pf({ monthly: 1_000, tx: [{ ...legacyBuy, ticker: "BBB", amount: 10_000 }] }),
      last,
    );
    expect(s.invested).toBeGreaterThan(10_000);
    expect(s.returnOnInvested).toBeCloseTo(0, 4);
    expect(s.cash).toBeGreaterThan(9_000); // unweighted: deposits stay in cash
  });

  it("a later start does not claim the earlier window", () => {
    const s = computeState(index, pf({ startDate: dates[150], tx: [legacyBuy] }), last);
    expect(s.dates[0]).toBe(dates[150]);
  });

  it("weighted contributions are invested, not left idle", () => {
    const s = computeState(
      index,
      pf({ monthly: 1_000, weights: { AAA: 1 }, tx: [{ ...legacyBuy, amount: 10_000 }] }),
      last,
    );
    expect(s.cash).toBeCloseTo(0, 2);
  });
});

describe("time-weighted risk metrics", () => {
  it("contributions into a flat market show no volatility and no drawdown", () => {
    const s = computeState(
      index,
      pf({ monthly: 1_000, weights: { BBB: 1 }, tx: [{ id: "x", kind: "buy", date: dates[0], ticker: "BBB", amount: 10_000 }] }),
      last,
    );
    expect(s.volatility).toBeCloseTo(0, 12);
    expect(s.maxDrawdown).toBeCloseTo(0, 12);
    expect(s.twr).toBeCloseTo(0, 12);
  });

  it("a fall is a fall even while deposits keep arriving", () => {
    // CCC slides steadily from 100 to 50 over days 40-140 while $5k a month
    // keeps arriving: the case where a balance-based drawdown hid the fall.
    const c = dates.map((_, i) => (i < 40 ? 100 : i < 140 ? 100 - ((i - 40) / 100) * 50 : 50));
    const idx = buildIndex({ generated: "", source: "f", series: { CCC: { dates, closes: c } } });
    const s = computeState(
      idx,
      pf({ monthly: 5_000, weights: { CCC: 1 }, tx: [{ id: "x", kind: "buy", date: dates[0], ticker: "CCC", amount: 10_000 }] }),
      dates[200],
    );
    expect(s.maxDrawdown).toBeCloseTo(-0.5, 9);
    // The raw balance never falls 50%, because deposits refill it.
    let peak = 0;
    let rawDd = 0;
    for (const v of s.values) {
      peak = Math.max(peak, v);
      rawDd = Math.min(rawDd, v / peak - 1);
    }
    expect(rawDd).toBeGreaterThan(-0.3);
  });

  it("a cash deposit is not a gain", () => {
    const s = computeState(
      index,
      pf({ tx: [{ id: "d", kind: "deposit", date: dates[10], amount: 10_000 }] }),
      last,
    );
    expect(s.invested).toBe(20_000);
    expect(s.twr).toBeCloseTo(0, 12);
    expect(s.volatility).toBeCloseTo(0, 12);
  });
});

describe("review regression on bundled data", () => {
  // From the 12 Nov 2026 review: VTI/BND from 2023 showed 13.3% vol and a
  // -9.5% max drawdown; the flow-adjusted figures are 10.4% and -12.7%.
  it("VTI/BND from 2023 matches the time-weighted figures", () => {
    const bundle = JSON.parse(readFileSync("test/fixtures/prices.json", "utf8")) as PriceBundle;
    const real = buildIndex(bundle);
    const start = real.calendar.find((x) => x >= "2023-01-01")!;
    const s = computeState(
      real,
      pf({
        startDate: start,
        monthly: 500,
        weights: { VTI: 0.6, BND: 0.4 },
        tx: [
          { id: "a", kind: "buy", date: start, ticker: "VTI", amount: 6_000 },
          { id: "b", kind: "buy", date: start, ticker: "BND", amount: 4_000 },
        ],
      }),
      real.lastDate,
    );
    expect(s.volatility).toBeCloseTo(0.104, 3);
    expect(s.maxDrawdown).toBeCloseTo(-0.127, 3);
  });
});

describe("weekly deposits and mix changes", () => {
  // A small market: AAA doubles from day 60, BBB is flat, CCC has a gap.
  const days = dates.slice(0, 120);
  const idx = buildIndex({
    generated: "",
    source: "mix",
    series: {
      AAA: { dates: days, closes: days.map((_, i) => (i < 60 ? 100 : 200)) },
      BBB: { dates: days, closes: days.map(() => 50) },
      CCC: { dates: days.filter((_, i) => i !== 31), closes: days.filter((_, i) => i !== 31).map(() => 10) },
    },
  });
  const end = days[days.length - 1];
  const mix = (id: string, weights: Record<string, number>, over: Partial<Tx> = {}): Tx => ({
    id,
    kind: "rebalance",
    date: days[0],
    weights,
    ...over,
  });

  it("puts the weekly amount in on the first trading day of each later week", () => {
    const s = computeState(idx, pf({ startDate: days[0], initial: 1_000, weekly: 100, tx: [mix("m", { BBB: 1 })] }), end);
    // 120 weekdays = 24 weeks; the first week's day is the start (initial only).
    expect(s.invested).toBe(1_000 + 23 * 100);
    expect(s.cash).toBeCloseTo(0, 6); // every deposit followed the mix
    expect(s.volatility).toBeCloseTo(0, 12);
  });

  it("a what-if's first mix (no placedAt) fills at the start date's close", () => {
    const s = computeState(idx, pf({ startDate: days[0], initial: 1_000, tx: [mix("m", { AAA: 0.5, BBB: 0.5 })] }), end);
    expect(s.fills.m.date).toBe(days[0]);
    expect(s.fills.m.amount).toBe(1_000);
    const units = Object.fromEntries(s.holdings.map((h) => [h.ticker, h.units]));
    expect(units.AAA).toBeCloseTo(5, 9); // $500 at 100
    expect(units.BBB).toBeCloseTo(10, 9); // $500 at 50
  });

  it("a mix change moves everything at the next close, valued at that close", () => {
    const change = mix("c", { BBB: 1 }, { date: days[70], placedAt: nyTime(days[70], 17) });
    const s = computeState(idx, pf({ startDate: days[0], initial: 1_000, tx: [mix("m", { AAA: 1 }), change] }), end);
    // 10 AAA units bought at 100 are worth 2,000 by day 71; all moved to BBB at 50.
    expect(s.fills.c.date).toBe(days[71]);
    expect(s.fills.c.amount).toBeCloseTo(2_000, 6);
    expect(s.holdings).toHaveLength(1);
    expect(s.holdings[0]).toMatchObject({ ticker: "BBB" });
    expect(s.holdings[0].units).toBeCloseTo(40, 9);
    expect(s.currentWeights).toEqual({ BBB: 1 });
  });

  it("deposits after a mix change follow the new mix", () => {
    const change = mix("c", { BBB: 1 }, { date: days[2], placedAt: nyTime(days[2], 10) });
    const s = computeState(
      idx,
      pf({ startDate: days[0], initial: 1_000, weekly: 100, tx: [mix("m", { AAA: 1 }), change] }),
      days[30],
    );
    expect(s.holdings.map((h) => h.ticker)).toEqual(["BBB"]);
  });

  it("a mix change waits for every ticker in it to have a close", () => {
    // CCC has no close on day 31; an order placed after day 30's close waits for day 32.
    const change = mix("c", { CCC: 0.5, BBB: 0.5 }, { date: days[30], placedAt: nyTime(days[30], 17) });
    const s = computeState(idx, pf({ startDate: days[0], initial: 1_000, tx: [mix("m", { BBB: 1 }), change] }), end);
    expect(s.fills.c.date).toBe(days[32]);
  });

  it("a mix change whose close hasn't happened is pending, and keeps the old mix", () => {
    const change = mix("c", { AAA: 1 }, { date: end, placedAt: nyTime(end, 17) });
    const s = computeState(idx, pf({ startDate: days[0], initial: 1_000, tx: [mix("m", { BBB: 1 }), change] }), end);
    expect(s.pending).toEqual([
      { txId: "c", kind: "rebalance", amount: 0, weights: { AAA: 1 }, placedAt: change.placedAt },
    ]);
    expect(s.currentWeights).toEqual({ BBB: 1 });
  });

  it("a live first mix leaves the money as cash until its close", () => {
    const first = mix("m", { AAA: 1 }, { date: end, placedAt: nyTime(end, 17) });
    const s = computeState(idx, pf({ startDate: end, initial: 1_000, weekly: 100, tx: [first] }), end);
    expect(s.value).toBe(1_000);
    expect(s.holdings).toHaveLength(0);
    expect(s.pending.map((o) => o.kind)).toEqual(["rebalance"]);
  });
});

describe("a stock that started trading after the start date", () => {
  // OLD trades from day 0 at 100 (flat); NEW starts trading on day 40 at 20, then 40 from day 80.
  const days = dates.slice(0, 120);
  const idx = buildIndex({
    generated: "",
    source: "listing",
    series: {
      OLD: { dates: days, closes: days.map(() => 100) },
      NEW: { dates: days.slice(40), closes: days.slice(40).map((_, i) => (i + 40 < 80 ? 20 : 40)) },
    },
  });
  const end = days[days.length - 1];
  const first = (weights: Record<string, number>, over: Partial<Tx> = {}): Tx => ({
    id: "m",
    kind: "rebalance",
    date: days[0],
    weights,
    ...over,
  });

  it("holds the whole amount as cash until its first trading day, then buys in at that close", () => {
    const s = computeState(idx, pf({ startDate: days[0], initial: 10_000, tx: [first({ NEW: 1 })] }), end);
    expect(s.fills.m.date).toBe(days[0]); // the mix is in force from the start date
    expect(s.values[39]).toBe(10_000); // flat cash before NEW trades
    expect(s.boughtIn).toEqual({ NEW: days[40] });
    expect(s.holdings[0]).toMatchObject({ ticker: "NEW" });
    expect(s.holdings[0].units).toBeCloseTo(500, 9); // $10,000 at 20
    expect(s.value).toBeCloseTo(20_000, 6); // NEW doubled
    expect(s.waiting).toEqual({});
  });

  it("in a mix, only the new stock's share waits; the rest is invested from the start", () => {
    const s = computeState(idx, pf({ startDate: days[0], initial: 10_000, tx: [first({ OLD: 0.6, NEW: 0.4 })] }), days[20]);
    const units = Object.fromEntries(s.holdings.map((h) => [h.ticker, h.units]));
    expect(units.OLD).toBeCloseTo(60, 9); // $6,000 at 100 on day 0
    expect(units.NEW).toBeUndefined();
    expect(s.waiting).toEqual({ NEW: 4_000 });
    expect(s.value).toBeCloseTo(10_000, 6); // waiting cash counts toward the value
  });

  it("weekly deposits set aside the new stock's share too, and it all buys in on day one of trading", () => {
    const s = computeState(
      idx,
      pf({ startDate: days[0], initial: 1_000, weekly: 100, tx: [first({ OLD: 0.5, NEW: 0.5 })] }),
      end,
    );
    // Before day 40: 7 weekly deposits (days 5, 10, … 35), $50 each set aside for NEW.
    const newUnits = s.holdings.find((h) => h.ticker === "NEW")!.units;
    const beforeListing = 500 + 7 * 50; // initial share + deposits on days 5..35
    const after = Array.from({ length: 23 }, (_, k) => 5 * (k + 1)).filter((d) => d >= 40);
    const expected = beforeListing / 20 + after.reduce((u, d) => u + 50 / (d < 80 ? 20 : 40), 0);
    expect(newUnits).toBeCloseTo(expected, 6);
    expect(s.cash).toBeCloseTo(0, 6);
    expect(s.invested).toBe(1_000 + 23 * 100);
  });

  it("a mix whose stocks all trade from the start is unaffected", () => {
    const s = computeState(idx, pf({ startDate: days[50], initial: 10_000, tx: [first({ OLD: 0.5, NEW: 0.5 }, { date: days[50] })] }), end);
    expect(s.boughtIn).toEqual({});
    expect(s.waiting).toEqual({});
    expect(s.fills.m.date).toBe(days[50]);
  });

  it("a live mix change to a stock that isn't trading yet doesn't hold up the rest", () => {
    const start = mix0(days[0]);
    const change: Tx = { id: "c", kind: "rebalance", date: days[10], placedAt: nyTime(days[10], 10), weights: { OLD: 0.5, NEW: 0.5 } };
    const s = computeState(idx, pf({ startDate: days[0], initial: 10_000, tx: [start, change] }), days[20]);
    expect(s.fills.c.date).toBe(days[10]);
    expect(s.waiting).toEqual({ NEW: 5_000 });
  });

  function mix0(day: string): Tx {
    return { id: "m", kind: "rebalance", date: day, weights: { OLD: 1 } };
  }
});

describe("portfolio detail: costs, taxes, bumps, per-stock values, timeline", () => {
  // 400 weekdays from 2024-01-01 (about 19 months). C: 100, then 150 from day 300. D: flat 100.
  const days: string[] = [];
  for (let d = new Date("2024-01-01T00:00:00Z"); days.length < 400; d = new Date(d.getTime() + 86_400_000)) {
    if (d.getUTCDay() % 6 !== 0) days.push(d.toISOString().slice(0, 10));
  }
  const idx = buildIndex({
    generated: "",
    source: "tax",
    series: {
      C: { dates: days, closes: days.map((_, i) => (i < 300 ? 100 : 150)) },
      D: { dates: days, closes: days.map(() => 100) },
    },
  });
  const end = days[days.length - 1];
  const mix = (id: string, date: string, weights: Record<string, number>): Tx => ({ id, kind: "rebalance", date, weights });

  it("knows when a holding turns long-term (more than a year)", () => {
    expect(heldOverAYear("2024-01-02", "2025-01-02")).toBe(false);
    expect(heldOverAYear("2024-01-02", "2025-01-03")).toBe(true);
  });

  it("nets gains and losses like the IRS, at 24% short-term and 15% long-term", () => {
    expect(taxOn(1_000, 2_000)).toBeCloseTo(240 + 300, 9);
    expect(taxOn(-500, 2_000)).toBeCloseTo(1_500 * 0.15, 9);
    expect(taxOn(500, -2_000)).toBe(0);
    expect(taxOn(-100, -100)).toBe(0);
  });

  it("tracks cost basis, and the tax a sale today would owe on a long-held gain", () => {
    const s = computeState(idx, pf({ startDate: days[0], initial: 10_000, tx: [mix("m", days[0], { C: 1 })] }), end);
    expect(s.holdings[0]).toMatchObject({ ticker: "C", cost: 10_000 });
    expect(s.taxes.unrealizedLong).toBeCloseTo(5_000, 6);
    expect(s.taxes.unrealizedShort).toBeCloseTo(0, 6);
    expect(s.taxes.potentialTax).toBeCloseTo(750, 6);
    expect(s.taxes.actualTax).toBe(0);
    expect(s.realized).toEqual([]);
  });

  it("a mix change sells what's held: the gain is realized and taxed", () => {
    const s = computeState(
      idx,
      pf({ startDate: days[0], initial: 10_000, tx: [mix("m", days[0], { C: 1 }), mix("n", days[350], { D: 1 })] }),
      end,
    );
    expect(s.realized).toHaveLength(1);
    expect(s.realized[0]).toMatchObject({ ticker: "C", longTerm: true });
    expect(s.realized[0].gain).toBeCloseTo(5_000, 6);
    expect(s.taxes.actualTax).toBeCloseTo(750, 6);
    expect(s.taxes.potentialTax).toBeCloseTo(0, 6); // D hasn't moved
    expect(s.events.map((e) => e.kind)).toEqual(["start", "mix"]);
  });

  it("weekly buys are separate lots, so recent ones would be short-term", () => {
    const s = computeState(idx, pf({ startDate: days[0], initial: 1_000, weekly: 100, tx: [mix("m", days[0], { C: 1 })] }), end);
    const lots = s.lots.filter((l) => l.ticker === "C");
    expect(lots.length).toBeGreaterThan(70);
    // Buys after day 300 were at 150 and haven't moved: no gain on those.
    expect(s.taxes.unrealizedShort).toBeGreaterThan(0); // weeks bought at 100 within the last year
    expect(s.taxes.unrealizedLong).toBeGreaterThan(0);
  });

  it("finds the biggest bump and its dates", () => {
    const s = computeState(idx, pf({ startDate: days[0], initial: 10_000, tx: [mix("m", days[0], { C: 1 })] }), end);
    expect(s.maxRunUp).toBeCloseTo(0.5, 9);
    expect(s.maxRunUpDates).toEqual([days[0], days[300]]);
    expect(s.maxDrawdownDates).toBeUndefined();
  });

  it("records each stock's value and the cash, day by day", () => {
    const s = computeState(
      idx,
      pf({ startDate: days[0], initial: 10_000, tx: [mix("m", days[0], { C: 1 }), mix("n", days[350], { D: 1 })] }),
      end,
    );
    expect(s.byTicker.C).toHaveLength(s.dates.length);
    expect(s.byTicker.D).toHaveLength(s.dates.length);
    expect(s.byTicker.C[0]).toBeCloseTo(10_000, 6);
    expect(s.byTicker.C[349]).toBeCloseTo(15_000, 6);
    expect(s.byTicker.C[350]).toBe(0);
    expect(s.byTicker.D[349]).toBe(0);
    expect(s.byTicker.D[350]).toBeCloseTo(15_000, 6);
    expect(s.cashSeries.every((c) => Math.abs(c) < 1e-6)).toBe(true);
  });
});

describe("timeline for a stock that started trading later", () => {
  const days = dates.slice(0, 120);
  const idx = buildIndex({
    generated: "",
    source: "listing-timeline",
    series: {
      OLD: { dates: days, closes: days.map(() => 100) },
      NEW: { dates: days.slice(40), closes: days.slice(40).map(() => 20) },
    },
  });
  it("shows the start, the wait in cash, and the buy-in", () => {
    const s = computeState(
      idx,
      pf({ startDate: days[0], initial: 10_000, tx: [{ id: "m", kind: "rebalance", date: days[0], weights: { OLD: 0.5, NEW: 0.5 } }] }),
      days[119],
    );
    expect(s.events.map((e) => [e.kind, e.date])).toEqual([
      ["start", days[0]],
      ["waiting", days[0]],
      ["bought_in", days[40]],
    ]);
    expect(s.cashSeries[0]).toBeCloseTo(5_000, 6);
    expect(s.cashSeries[40]).toBeCloseTo(0, 6);
    expect(s.byTicker.NEW[39]).toBe(0);
    expect(s.byTicker.NEW[40]).toBeCloseTo(5_000, 6);
  });
});

describe("mixes bought by shares (under 100%, rest in cash)", () => {
  const mixTx = (weights: Record<string, number>): Tx => ({ id: "m", kind: "rebalance", date: dates[0], weights });

  it("keeps the unspent part of the starting amount as cash", () => {
    // 50 AAA at 100 ($5,000) + 60 BBB at 50 ($3,000) out of $10,000: $2,000 stays cash.
    const s = computeState(index, pf({ tx: [mixTx({ AAA: 0.5, BBB: 0.3 })] }), last);
    const units = Object.fromEntries(s.holdings.map((h) => [h.ticker, h.units]));
    expect(units.AAA).toBeCloseTo(50, 9);
    expect(units.BBB).toBeCloseTo(60, 9);
    expect(s.cashSeries[0]).toBeCloseTo(2_000, 6);
    expect(s.values[0]).toBeCloseTo(10_000, 6);
    expect(s.value).toBeCloseTo(10_500, 6); // AAA's 10% step on half the money; cash doesn't move
  });

  it("a weekly deposit keeps the same share in cash", () => {
    const s = computeState(index, pf({ initial: 1_000, weekly: 100, tx: [mixTx({ AAA: 0.8 })] }), dates[30]);
    expect(s.invested).toBeGreaterThan(1_000);
    expect(s.cashSeries[30]).toBeCloseTo(s.invested * 0.2, 6);
  });

  it("names the cash in the mix label", async () => {
    const { mixLabel } = await import("@/lib/ledger");
    expect(mixLabel({ AAA: 0.5, BBB: 0.44 })).toBe("AAA 50% · BBB 44% · Cash 6%");
    expect(mixLabel({ AAA: 0.5, BBB: 0.5 })).toBe("AAA 50% · BBB 50%");
  });
});
