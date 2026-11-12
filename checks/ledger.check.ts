/**
 * Independent check of the ledger engine.
 *
 * Deliberately computes the same thing a different way - explicit unit
 * accumulation with hand-rolled prices - and asserts the engine agrees. Also
 * asserts the invariants that make every figure on screen trustworthy.
 *
 * Run: node_modules/.bin/tsx --tsconfig tsconfig.check.json checks/ledger.check.ts
 */
import { computeState } from "@/lib/ledger";
import type { Portfolio, PriceBundle, PriceSeries } from "@/lib/types";
import { buildIndex } from "@/lib/prices";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL  ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`ok    ${msg}`);
  }
}

function near(a: number, b: number, tol = 0.01) {
  return Math.abs(a - b) <= tol;
}

// ---- fixture: two tickers, flat then a clean doubling -----------------------
const dates: string[] = [];
const a: number[] = [];
const b: number[] = [];
let d = new Date("2024-01-01T00:00:00Z");
let n = 0;
while (n < 240) {
  const wd = d.getUTCDay();
  if (wd !== 0 && wd !== 6) {
    dates.push(d.toISOString().slice(0, 10));
    // AAA rises 10% over the window exactly once at day 120; BBB is flat.
    a.push(n < 120 ? 100 : 110);
    b.push(50);
    n++;
  }
  d = new Date(d.getTime() + 86_400_000);
}

const bundle: PriceBundle = {
  generated: dates[dates.length - 1],
  source: "fixture",
  series: {
    AAA: { dates, closes: a } as PriceSeries,
    BBB: { dates, closes: b } as PriceSeries,
  },
};
const index = buildIndex(bundle);
const last = index.lastDate;

// ---- portfolio: 10k initial (deposited, not auto-invested), buy 5k AAA ------
const p: Portfolio = {
  id: "p1",
  name: "Test",
  thesis: "",
  startDate: dates[0],
  initial: 10_000,
  monthly: 0,
  tx: [{ id: "t1", kind: "buy", date: dates[0], ticker: "AAA", amount: 5_000 }],
};

const s = computeState(index, p, last);
assert(s.rejected.length === 0, `no rejected trades (got ${s.rejected.join("; ")})`);
assert(near(s.invested, 10_000), `invested is the deposit only: ${s.invested}`);
assert(near(s.cash, 5_000), `unspent cash is preserved, not auto-invested: ${s.cash}`);

// 5000 of AAA at 100 -> 50 units; price 110 at the end -> 5500 + 5000 cash
assert(near(s.value, 10_500), `value = 50*110 + 5000 = ${s.value}`);
assert(near(s.returnOnInvested, 0.05), `return on invested = 5%: ${s.returnOnInvested}`);

// ---- overspend must be rejected, never clamped ------------------------------
const over: Portfolio = {
  ...p,
  id: "p2",
  tx: [{ id: "t2", kind: "buy", date: dates[0], ticker: "AAA", amount: 25_000 }],
};
const so = computeState(index, over, last);
assert(so.rejected.length === 1, "an unfundable buy is rejected");
assert(near(so.cash, 10_000), `rejected buy leaves cash untouched: ${so.cash}`);
assert(so.value === 10_000, `rejected buy does not create value: ${so.value}`);

// ---- selling more than held must not invent cash ---------------------------
const oversell: Portfolio = {
  ...p,
  id: "p3",
  tx: [
    { id: "t3", kind: "buy", date: dates[0], ticker: "AAA", amount: 5_000 },
    { id: "t4", kind: "sell", date: dates[120], ticker: "AAA", units: 500 },
  ],
};
const ss = computeState(index, oversell, last);
assert(ss.holdings.length === 0, "oversell liquidates the position");
assert(
  near(ss.cash, 10_500),
  `oversell returns only what was held (5500 + 5000): ${ss.cash}`,
);

// ---- monthly contributions accumulate as invested, not as performance ------
const withMonthly: Portfolio = {
  ...p,
  id: "p4",
  tx: [{ id: "t5", kind: "buy", date: dates[0], ticker: "BBB", amount: 10_000 }],
  monthly: 1_000,
};
const sm = computeState(index, withMonthly, last);
const months = new Set(dates.slice(1).map((x) => x.slice(0, 7))).size;
assert(
  sm.invested > 10_000,
  `monthly deposits are counted as invested: ${sm.invested} over ~${months} months`,
);
// BBB is flat, so any return must come from cash timing, never from price moves.
assert(
  near(sm.returnOnInvested, 0, 0.0001),
  `flat price with contributions shows no phantom return: ${sm.returnOnInvested}`,
);

// ---- drawdown is measured peak-to-trough on the value path -----------------
assert(s.maxDrawdown <= 0, `drawdown is non-positive: ${s.maxDrawdown}`);

// ---- a portfolio that starts later must not claim the earlier window -------
const late: Portfolio = { ...p, id: "p5", startDate: dates[150] };
const sl = computeState(index, late, last);
assert(sl.dates[0] === dates[150], `later start begins on its own date: ${sl.dates[0]}`);
assert(sl.dates.length < s.dates.length, "later start has fewer days of history");

// ---- contributions with weights are invested, not left as idle cash --------
// This is the check that matters most for the product's claim: two portfolios
// receiving identical deposits must differ because of what they BOUGHT, never
// because one happened to sit on cash.
const deployed: Portfolio = {
  ...p,
  id: "p6",
  monthly: 1_000,
  weights: { AAA: 1 },
  tx: [{ id: "t6", kind: "buy", date: dates[0], ticker: "AAA", amount: 10_000 }],
};
const sd = computeState(index, deployed, last);
assert(near(sd.cash, 0, 0.01), `weighted contributions leave no idle cash: ${sd.cash.toFixed(4)}`);
assert(
  near(sd.invested, sm.invested),
  `same deposits as the unweighted run: ${sd.invested} vs ${sm.invested}`,
);
// AAA rises 10% once, so a fully-invested path must beat the cash-hoarding one.
assert(
  sd.returnOnInvested > sm.returnOnInvested + 0.001,
  `deploying deposits changes the result (${(sd.returnOnInvested * 100).toFixed(2)}% vs ${(sm.returnOnInvested * 100).toFixed(2)}%)`,
);

// ---- an unweighted portfolio must NOT silently auto-invest -----------------
assert(
  sm.cash > 9_000,
  `without weights, deposits stay in cash: cash ${sm.cash.toFixed(0)} of ${sm.invested}`,
);

console.log(process.exitCode ? "\nFAILURES ABOVE" : "\nall checks passed");
