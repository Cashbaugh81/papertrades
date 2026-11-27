// Trades (buys and sells) on top of a starting mix: the rules from the
// buy/sell plan (claude/buy-sell-plan.md), one test per edge case.
import { describe, expect, it } from "vitest";
import { computeState, heldOverAYear } from "@/lib/ledger";
import { buildIndex } from "@/lib/prices";
import { cashAvailableOn, checkDelete, checkTrade, sharesHeldOn, tradingDayFor } from "@/lib/trades";
import type { Portfolio, PriceBundle, Tx } from "@/lib/types";

// ---- fixture: weekdays from Mon 2024-01-01 for ~2.3 years ----
// AAA: 100, then 110 from day 120, then 120 from day 400. BBB: 50 throughout.
// LATE: starts trading on day 200 at 20.
const days: string[] = [];
{
  let d = new Date("2024-01-01T00:00:00Z");
  while (days.length < 600) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86_400_000);
  }
}
const aaa = (i: number) => (i < 120 ? 100 : i < 400 ? 110 : 120);
function makeIndex(adjust = (_i: number, px: number) => px) {
  return buildIndex({
    generated: days[days.length - 1],
    source: "fixture",
    series: {
      AAA: { dates: days, closes: days.map((_, i) => adjust(i, aaa(i))) },
      BBB: { dates: days, closes: days.map(() => 50) },
      LATE: { dates: days.slice(200), closes: days.slice(200).map(() => 20) },
    },
  } satisfies PriceBundle);
}
const index = makeIndex();
const end = index.lastDate;

const start: Tx = { id: "start", kind: "rebalance", date: days[0], weights: { AAA: 1 } };
function pf(tx: Tx[] = [], over: Partial<Portfolio> = {}): Portfolio {
  return { id: "p", name: "T", thesis: "", startDate: days[0], initial: 10_000, weekly: 0, tx: [start, ...tx], ...over };
}
const sell = (id: string, day: string, ticker: string, fraction: number): Tx => ({ id, kind: "sell", date: day, ticker, fraction });
const sellUsd = (id: string, day: string, ticker: string, amount: number): Tx => ({ id, kind: "sell", date: day, ticker, amount });
const buy = (id: string, day: string, ticker: string, amount: number): Tx => ({ id, kind: "buy", date: day, ticker, amount });
const held = (s: ReturnType<typeof computeState>, t: string) => s.holdings.find((h) => h.ticker === t)?.units ?? 0;

describe("selling", () => {
  it("sells half at that day's close; the money becomes cash and stays cash", () => {
    const s = computeState(index, pf([sell("s", days[150], "AAA", 0.5)]), end);
    expect(held(s, "AAA")).toBeCloseTo(50, 9);
    expect(s.cash).toBeCloseTo(50 * 110, 6); // half of 100 shares at 110
    expect(s.freeCashSeries[149]).toBe(0);
    expect(s.freeCashSeries[150]).toBeCloseTo(5_500, 6);
    expect(s.fills.s).toMatchObject({ date: days[150], price: 110 });
    expect(s.realized).toEqual([expect.objectContaining({ ticker: "AAA", gain: expect.closeTo(500, 6), longTerm: false })]);
  });

  it("All sells exactly what's held: nothing left behind", () => {
    const s = computeState(index, pf([sell("s", days[150], "AAA", 1)]), end);
    expect(s.holdings).toHaveLength(0);
    expect(s.cash).toBeCloseTo(11_000, 6);
  });

  it("a dollar sale for more than is held is refused, with the amounts", () => {
    const c = checkTrade(index, pf(), sellUsd("s", days[150], "AAA", 20_000), end);
    expect(c.ok).toBe(false);
    expect(c.own).toBe("The Jul 29, 2024 sale of AAA is for $20,000.00, but only $11,000.00 of it is held then.");
  });

  it("can't sell what isn't held", () => {
    const c = checkTrade(index, pf(), sell("s", days[150], "BBB", 0.5), end);
    expect(c.own).toBe("There's no BBB to sell on Jul 29, 2024.");
  });

  it("can't sell a stock still waiting to start trading (its money is set aside)", () => {
    const p = pf([], { tx: [{ ...start, weights: { AAA: 0.5, LATE: 0.5 } }] });
    const c = checkTrade(index, p, sell("s", days[100], "LATE", 1), end);
    // A dated sale before the stock first traded is caught by the date check.
    expect(c.own).toBe("LATE hadn't started trading on May 20, 2024 (it first traded on Oct 7, 2024).");
  });
});

describe("buying", () => {
  it("buys from cash at that day's close", () => {
    const s = computeState(index, pf([sell("s", days[150], "AAA", 1), buy("b", days[160], "BBB", 5_000)]), end);
    expect(held(s, "BBB")).toBeCloseTo(100, 9);
    expect(s.cash).toBeCloseTo(6_000, 6);
  });

  it("a buy needing more cash than there is is refused, with the amounts", () => {
    const c = checkTrade(index, pf([sell("s", days[150], "AAA", 0.5)]), buy("b", days[160], "BBB", 9_000), end);
    expect(c.own).toBe("The Aug 12, 2024 purchase of BBB needs $9,000.00, but only $5,500.00 is in cash then.");
  });

  it("can't buy a stock before it first traded", () => {
    const c = checkTrade(index, pf([sell("s", days[150], "AAA", 1)]), buy("b", days[180], "LATE", 1_000), end);
    expect(c.own).toBe(`LATE hadn't started trading on Sep 9, 2024 (it first traded on Oct 7, 2024).`);
    expect(checkTrade(index, pf([sell("s", days[150], "AAA", 1)]), buy("b", days[210], "LATE", 1_000), end).ok).toBe(true);
  });

  it("can't trade before the portfolio started", () => {
    const p = pf([], { startDate: days[50], tx: [{ ...start, date: days[50] }] });
    const c = checkTrade(index, p, sell("s", days[10], "AAA", 0.5), end);
    expect(c.own).toMatch(/is before this portfolio started \(Mar 11, 2024\)\./);
  });

  it("selling then buying back the same stock starts a new lot; the next sale takes the oldest first", () => {
    const s = computeState(
      index,
      pf([sell("s1", days[150], "AAA", 0.5), buy("b", days[160], "AAA", 5_500), sell("s2", days[450], "AAA", 0.5)]),
      end,
    );
    // After s1: 50 old shares (cost 100) + 50 new (cost 110). s2 sells 50: all of the old lot.
    const s2 = s.realized.filter((r) => r.sold === days[450]);
    expect(s2).toHaveLength(1);
    expect(s2[0]).toMatchObject({ bought: days[0], longTerm: true });
    expect(s2[0].gain).toBeCloseTo(50 * (120 - 100), 6);
  });
});

describe("same day: sells before buys", () => {
  it("a sale pays for a purchase on the same day, whatever order they were entered in", () => {
    const s = computeState(index, pf([buy("b", days[150], "BBB", 11_000), sell("s", days[150], "AAA", 1)]), end);
    expect(s.rejections).toEqual({});
    expect(held(s, "BBB")).toBeCloseTo(220, 9);
    expect(s.cash).toBeCloseTo(0, 6);
  });
});

describe("a weekend or holiday date", () => {
  it("trades at the next trading day's close", () => {
    const sat = "2024-07-27"; // Saturday
    const s = computeState(index, pf([sell("s", sat, "AAA", 0.5)]), end);
    expect(s.fills.s.date).toBe("2024-07-29");
    expect(tradingDayFor(s, sat)).toBe("2024-07-29");
  });
});

describe("weekly deposits", () => {
  const weekly = { weekly: 100 };

  it("before any trade they follow the starting mix (unchanged from before trades existed)", () => {
    const p = pf([], { ...weekly, tx: [{ ...start, weights: { AAA: 0.5, BBB: 0.5 } }] });
    const s = computeState(index, p, days[200]);
    expect(s.cash).toBeCloseTo(0, 6);
    // Each deposit splits 50/50 by the mix, not by the (drifted) holdings.
    const withTrade = computeState(index, { ...p, tx: [...p.tx, sell("s", days[199], "AAA", 0.0001)] }, days[198]);
    expect(withTrade.values).toEqual(s.values.slice(0, withTrade.values.length));
  });

  it("after selling everything, they stay in cash", () => {
    const s = computeState(index, pf([sell("s", days[150], "AAA", 1)], weekly), end);
    expect(s.holdings).toHaveLength(0);
    // From the sale on, cash grows by exactly the deposits.
    const last = s.dates.length - 1;
    expect(s.freeCashSeries[last] - s.freeCashSeries[150]).toBeCloseTo(s.investedSeries[last] - s.investedSeries[150], 6);
  });

  it("after a trade, they follow what's held by value, with cash counting", () => {
    // Day 150: sell half → 50 AAA ($5,500) + $5,500 cash: 50/50. The next deposit splits 50/50.
    const s = computeState(index, pf([sell("s", days[150], "AAA", 0.5)], weekly), end);
    const next = s.investedSeries.findIndex((v, i) => i > 150 && v > s.investedSeries[150]);
    expect(s.freeCashSeries[next] - s.freeCashSeries[next - 1]).toBeCloseTo(50, 6);
    expect(s.byTicker.AAA[next] - s.byTicker.AAA[next - 1]).toBeCloseTo(50, 6);
  });

  it("money set aside for a stock not trading yet doesn't count toward the split", () => {
    const p = pf([], { ...weekly, tx: [{ ...start, weights: { AAA: 0.5, LATE: 0.5 } }, sell("s", days[150], "AAA", 0.5)] });
    const s = computeState(index, p, days[190]);
    // Held: half the AAA, the other half now cash (equal values), plus money set aside for LATE.
    // Deposits split AAA/cash 50/50; nothing more goes to LATE.
    const next = s.investedSeries.findIndex((v, i) => i > 150 && v > s.investedSeries[150]);
    expect(s.freeCashSeries[next] - s.freeCashSeries[next - 1]).toBeCloseTo(50, 6);
    const setAside = s.waiting.LATE;
    expect(computeState(index, p, days[199]).waiting.LATE).toBeCloseTo(setAside, 6);
  });
});

describe("checking the whole history", () => {
  const base = [sell("s", days[150], "AAA", 1), buy("b", days[250], "BBB", 10_000)];

  it("an earlier purchase that spends cash a later one needs is refused, naming the later one", () => {
    const c = checkTrade(index, pf(base), buy("new", days[200], "BBB", 5_000), end);
    expect(c.own).toBeUndefined();
    expect(c.ok).toBe(false);
    expect(c.others).toEqual([
      { txId: "b", date: days[250], reason: "The Dec 16, 2024 purchase of BBB needs $10,000.00, but only $6,000.00 is in cash then." },
    ]);
  });

  it("deleting a sale whose money a later purchase uses is refused", () => {
    const c = checkDelete(index, pf(base), "s", end);
    expect(c.ok).toBe(false);
    expect(c.others[0]).toMatchObject({ txId: "b" });
    expect(checkDelete(index, pf(base), "b", end).ok).toBe(true);
  });

  it("cash available on a date leaves what later purchases need", () => {
    const s = computeState(index, pf(base), end);
    expect(cashAvailableOn(s, days[200])).toBeCloseTo(1_000, 6); // $11,000 − the $10,000 bought on day 250
    expect(cashAvailableOn(s, days[300])).toBeCloseTo(1_000, 6);
    expect(cashAvailableOn(s, days[100])).toBe(0); // nothing sold yet
  });

  it("shares held on a date", () => {
    const s = computeState(index, pf([sell("s", days[150], "AAA", 0.25)]), end);
    expect(sharesHeldOn(index, s, "AAA", days[100])).toBeCloseTo(100, 9);
    expect(sharesHeldOn(index, s, "AAA", days[160])).toBeCloseTo(75, 9);
  });
});

describe("prices re-adjusted after a dividend", () => {
  it("a sale stored as a share of the holding brings in the same money", () => {
    // Tiingo lowers every AAA close before day 300 by 2% (a dividend on day 300).
    const adjusted = makeIndex((i, px) => (i < 300 ? px * 0.98 : px));
    const p = pf([sell("s", days[150], "AAA", 0.5)]);
    const a = computeState(index, p, days[290]);
    const b = computeState(adjusted, p, days[290]);
    // Both prices before day 300 scaled the same, so the money from the sale is 2% lower in both
    // the holding and the cash: the share of the portfolio sold, and its gain %, don't change.
    expect(b.cash / b.value).toBeCloseTo(a.cash / a.value, 12);
    expect(b.realized[0].gain / b.realized[0].cost).toBeCloseTo(a.realized[0].gain / a.realized[0].cost, 12);
  });
});

describe("taxes on sales", () => {
  it("sold on the one-year anniversary is short-term; the day after is long-term", () => {
    expect(heldOverAYear("2024-01-01", "2025-01-01")).toBe(false);
    expect(heldOverAYear("2024-01-01", "2025-01-02")).toBe(true);
    const onIt = computeState(index, pf([sell("s", "2025-01-01", "AAA", 1)]), end);
    const after = computeState(index, pf([sell("s", "2025-01-02", "AAA", 1)]), end);
    expect(onIt.realized[0].longTerm).toBe(false);
    expect(after.realized[0].longTerm).toBe(true);
  });

  it("is owed by year: a loss in one year doesn't cancel a gain in another", () => {
    // 2024: sell half AAA at 110 (gain $500, short-term). 2025: buy BBB, then a loss on it is impossible
    // with a flat price, so use AAA: buy back at 120 (day 450, 2025) and sell at... a loss needs a fall:
    const falling = buildIndex({
      generated: days[days.length - 1],
      source: "fixture",
      series: { AAA: { dates: days, closes: days.map((_, i) => (i < 120 ? 100 : i < 300 ? 110 : 90)) } },
    } satisfies PriceBundle);
    const s = computeState(falling, pf([sell("s1", days[150], "AAA", 0.5), sell("s2", days[350], "AAA", 1)]), days[400]);
    expect(s.taxes.byYear.map((y) => y.year)).toEqual([2024, 2025]);
    const [y24, y25] = s.taxes.byYear;
    expect(y24.realizedShort).toBeCloseTo(500, 6);
    expect(y24.tax).toBeCloseTo(500 * 0.24, 6);
    expect(y25.realizedLong + y25.realizedShort).toBeCloseTo(-500, 6); // 50 shares bought at 100, sold at 90
    expect(y25.tax).toBe(0);
    expect(s.taxes.actualTax).toBeCloseTo(120, 6); // 2024's tax stands; 2025's loss doesn't erase it
  });
});

describe("now trades (phase 3)", () => {
  // Placed at 11:00 New York on day 150 (EST/EDT differ; 16:00 UTC is 11:00 or 12:00 NY, before the close either way).
  const at = (i: number) => `${days[i]}T16:00:00.000Z`;
  const nowSell = (id: string, i: number, fraction: number, livePx?: number): Tx => ({
    id,
    kind: "sell",
    date: days[i],
    placedAt: at(i),
    ticker: "AAA",
    fraction,
    ...(livePx ? { quote: { price: livePx, at: at(i) } } : {}),
  });

  it("a sale placed in market hours fills that day at the live price, not the close", () => {
    const s = computeState(index, pf([nowSell("n", 150, 0.5, 112)]), end);
    expect(s.fills.n).toMatchObject({ date: days[150], price: expect.closeTo(112, 9) });
    expect(s.cash).toBeCloseTo(50 * 112, 6);
    expect(s.events.find((e) => e.txId === "n")?.live).toEqual({ prices: { AAA: 112 }, at: at(150) });
  });

  it("the live price is carried as a ratio, so re-adjusted closes move it with them", () => {
    const halved = makeIndex((_i, px) => px / 2); // e.g. a 2-for-1 split re-adjusts history
    const frozen: Tx = { ...nowSell("n", 150, 0.5), quote: { price: 112, at: at(150), ratio: 112 / 110 } };
    const s = computeState(halved, pf([frozen]), end);
    expect(s.fills.n.price).toBeCloseTo(55 * (112 / 110), 9);
  });

  it("without a live price it fills at the next close, and is pending until that close is in", () => {
    const s = computeState(index, pf([nowSell("n", 150, 0.5)]), end);
    expect(s.fills.n).toMatchObject({ date: days[150], price: 110 });
    const before = computeState(index, pf([nowSell("n", 150, 0.5, 112)]), days[149]);
    expect(before.fills.n).toBeUndefined();
    expect(before.pending).toEqual([expect.objectContaining({ txId: "n", kind: "sell", fraction: 0.5, quote: { price: 112, at: at(150) } })]);
  });

  it("checks a now order against what's held, pending sales, and free cash", async () => {
    const { checkNowTrade, freeToSpendNow } = await import("@/lib/trades");
    const s = computeState(index, pf([nowSell("n", 599, 0.5, 121)]), days[598]); // pending
    const last = (t: string) => index.close(t, days[598]);
    expect(checkNowTrade(s, { kind: "sell", ticker: "AAA", fraction: 0.5 }, 120, last)).toBeUndefined();
    expect(checkNowTrade(s, { kind: "sell", ticker: "AAA", fraction: 0.6 }, 120, last)).toMatch(/left to sell/);
    expect(checkNowTrade(s, { kind: "sell", ticker: "BBB", fraction: 1 }, 50, last)).toMatch(/no BBB/);
    // The pending sale brings in 50 shares at 121.
    expect(freeToSpendNow(s, last)).toBeCloseTo(50 * 121, 6);
    expect(checkNowTrade(s, { kind: "buy", ticker: "BBB", amount: 6000 }, 50, last)).toBeUndefined();
    expect(checkNowTrade(s, { kind: "buy", ticker: "BBB", amount: 6100 }, 50, last)).toMatch(/free to spend/);
  });

  it("a sale then a purchase placed together fill the same day, the sale first", () => {
    const b: Tx = { id: "b", kind: "buy", date: days[150], placedAt: `${days[150]}T16:01:00.000Z`, ticker: "BBB", amount: 5000, quote: { price: 51, at: `${days[150]}T16:01:00.000Z` } };
    const s = computeState(index, pf([nowSell("n", 150, 0.5, 112), b]), end);
    expect(s.fills.b).toMatchObject({ date: days[150], price: expect.closeTo(51, 9), units: expect.closeTo(5000 / 51, 9) });
    expect(Object.keys(s.rejections)).toEqual([]);
  });
});

describe("now trades happen on the spot", () => {
  // The data ends on days[599]; "today" is the next weekday, with no close yet.
  const today = "2026-04-20";
  const at = `${today}T15:00:00.000Z`;
  const liveSell: Tx = { id: "ls", kind: "sell", date: today, placedAt: at, ticker: "AAA", fraction: 0.5, quote: { price: 125, at } };
  const liveBuy: Tx = { id: "lb", kind: "buy", date: today, placedAt: `${today}T15:01:00.000Z`, ticker: "BBB", amount: 3000, quote: { price: 49, at: `${today}T15:01:00.000Z` } };

  it("a live-priced sale and purchase show at once, before today's close", () => {
    expect(days[599] < today).toBe(true);
    const s = computeState(index, pf([liveSell, liveBuy]), end);
    expect(s.pending).toEqual([]);
    expect(s.fills.ls).toMatchObject({ date: today, price: 125, units: expect.closeTo(50, 9) });
    expect(s.fills.lb).toMatchObject({ date: today, price: 49, units: expect.closeTo(3000 / 49, 9) });
    expect(held(s, "AAA")).toBeCloseTo(50, 9);
    expect(s.cash).toBeCloseTo(50 * 125 - 3000, 6);
    expect(s.realized.at(-1)).toMatchObject({ sold: today, gain: expect.closeTo(50 * 125 - 50 * 100, 6) });
    // The daily path still ends at the last close; the value includes the trade.
    expect(s.dates.at(-1)).toBe(days[599]);
    expect(s.value).toBeCloseTo(50 * 120 + (3000 / 49) * 50 + 50 * 125 - 3000, 6);
    expect(s.events.find((e) => e.txId === "ls")).toMatchObject({ date: today, live: { prices: { AAA: 125 }, at } });
  });

  it("a live trade that doesn't fit is refused straight away", () => {
    const tooMuch: Tx = { ...liveBuy, id: "big", amount: 999_999 };
    const s = computeState(index, pf([tooMuch]), end);
    expect(s.rejections.big?.reason).toMatch(/needs \$999,999\.00/);
  });

  it("once today's close is in, it sits on that day at the same price", () => {
    const next = buildIndex({
      generated: today,
      source: "fixture",
      series: {
        AAA: { dates: [...days, today], closes: [...days.map((_, i) => aaa(i)), 124] },
        BBB: { dates: [...days, today], closes: [...days.map(() => 50), 50] },
      },
    });
    const s = computeState(next, pf([liveSell, liveBuy]), next.lastDate);
    expect(s.dates.at(-1)).toBe(today);
    expect(s.fills.ls).toMatchObject({ date: today, price: expect.closeTo(125, 9) });
    expect(s.fills.lb).toMatchObject({ date: today, price: expect.closeTo(49, 9) });
  });
});

describe("half days", () => {
  it("the day after Thanksgiving closes at 13:00 New York", async () => {
    const { closeInstant, closesAfter } = await import("@/lib/market");
    expect(new Date(closeInstant("2026-11-27")).toISOString()).toBe("2026-11-27T18:00:00.000Z");
    expect(new Date(closeInstant("2026-11-30")).toISOString()).toBe("2026-11-30T21:00:00.000Z");
    expect(closesAfter("2026-11-27", "2026-11-27T18:30:00.000Z")).toBe(false); // 13:30 → next close
  });
});
