// Trades (buys and sells) on top of a portfolio's history: checking a new trade
// or a deletion against the whole history, and what's available on a date.
// Shared by the trade dialog (preview) and the server (the final say), so the
// two always agree.
import { computeState, heldOverAYear } from "@/lib/ledger";
import type { PriceIndex } from "@/lib/prices";
import type { Fill, Portfolio, PortfolioState, Tx } from "@/lib/types";

export type TradeProblem = { txId: string; date: string; reason: string };

export type TradeCheck = {
  ok: boolean;
  /** Why this trade itself can't happen, if it can't. */
  own?: string;
  /** Other trades it would break, with why. */
  others: TradeProblem[];
  /** How it fills (day, price, shares, amount), when it does. */
  fill?: Fill;
  /** The portfolio with the change made. */
  state: PortfolioState;
};

/** Trades that can't happen in this history. */
export function problems(state: PortfolioState): TradeProblem[] {
  return Object.entries(state.rejections)
    .map(([txId, r]) => ({ txId, date: r.date, reason: r.reason }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Add `tx` to the portfolio and replay everything. OK only if the trade itself
 * fills and no other trade stops working because of it.
 */
export function checkTrade(index: PriceIndex, p: Portfolio, tx: Tx, end: string): TradeCheck {
  const before = new Set(Object.keys(computeState(index, p, end).rejections));
  const state = computeState(index, { ...p, tx: [...p.tx, tx] }, end);
  const all = problems(state);
  const own = all.find((x) => x.txId === tx.id)?.reason;
  const others = all.filter((x) => x.txId !== tx.id && !before.has(x.txId));
  return { ok: !own && !others.length, own, others, fill: state.fills[tx.id], state };
}

/** Remove trade `txId` and replay: OK only if no other trade stops working. */
export function checkDelete(index: PriceIndex, p: Portfolio, txId: string, end: string): TradeCheck {
  const before = new Set(Object.keys(computeState(index, p, end).rejections));
  const state = computeState(index, { ...p, tx: p.tx.filter((t) => t.id !== txId) }, end);
  const others = problems(state).filter((x) => !before.has(x.txId));
  return { ok: !others.length, others, state };
}

/** Index of the first trading day on or after `date` in the portfolio's history, or -1. */
function dayIndex(state: PortfolioState, date: string): number {
  return state.dates.findIndex((d) => d >= date);
}

/**
 * Cash that can be spent on `date` without taking money a later purchase
 * relies on: the smallest cash balance from that day on.
 */
export function cashAvailableOn(state: PortfolioState, date: string): number {
  const i = dayIndex(state, date);
  if (i < 0) return Math.max(0, state.cash);
  let min = Infinity;
  for (let k = i; k < state.freeCashSeries.length; k++) min = Math.min(min, state.freeCashSeries[k]);
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

/** Shares of `ticker` held at the close on `date` (or the next trading day). */
export function sharesHeldOn(index: PriceIndex, state: PortfolioState, ticker: string, date: string): number {
  const i = dayIndex(state, date);
  const v = i >= 0 ? state.byTicker[ticker]?.[i] : undefined;
  const px = i >= 0 ? index.close(ticker, state.dates[i]) : undefined;
  return v && px ? v / px : 0;
}

/** The trading day a trade on `date` happens: that day, or the next one the market was open. */
export function tradingDayFor(state: PortfolioState, date: string): string | undefined {
  const i = dayIndex(state, date);
  return i >= 0 ? state.dates[i] : undefined;
}

/** The most tickers held (or waiting to start trading) on any one day. */
export function tickersHeldAtOnce(state: PortfolioState): number {
  let most = 0;
  for (let i = 0; i < state.dates.length; i++) {
    let n = 0;
    for (const v of Object.values(state.byTicker)) if ((v[i] ?? 0) > 0.5) n++;
    most = Math.max(most, n);
  }
  return most + Object.keys(state.waiting).length;
}

/** At most this many different stocks held at once. */
export const MAX_HELD = 8;

/**
 * Check a "now" order (it fills later: at the live price taken now, or at the
 * next close) against the portfolio as it stands. `state` is the portfolio up
 * to the latest close, with its other pending orders; `price` is the live
 * price, or the latest close when there's no live one.
 *
 * Money a pending sale will bring in counts towards a purchase, so "sell this,
 * buy that" works the same day (sales fill before purchases). If a sale that
 * fills at the close brings in less than this estimate, the purchase is
 * refused when it fills, with the reason shown.
 */
export function checkNowTrade(
  state: PortfolioState,
  tx: Pick<Tx, "kind" | "ticker" | "amount" | "fraction">,
  price: number,
  priceOf: (ticker: string) => number | undefined,
): string | undefined {
  const t = tx.ticker!;
  const heldUnits = (ticker: string) => state.holdings.find((h) => h.ticker === ticker)?.units ?? 0;
  /** What pending sales of `ticker` will take, in shares (Infinity once one sells it all). */
  const pendingSold = (ticker: string, px: number) =>
    state.pending
      .filter((o) => o.kind === "sell" && o.ticker === ticker)
      .reduce((a, o) => a + (o.fraction !== undefined ? (o.fraction >= 1 - 1e-9 ? Infinity : heldUnits(ticker) * o.fraction) : o.amount / (o.quote?.price ?? px)), 0);
  if (tx.kind === "sell") {
    const held = heldUnits(t);
    if (!(held > 1e-9)) return `There's no ${t} to sell.`;
    const left = held - pendingSold(t, price);
    if (!(left > 1e-9)) return `All of your ${t} is already being sold.`;
    const want = tx.fraction !== undefined ? held * tx.fraction : (tx.amount ?? 0) / price;
    if (want > left * (1 + 1e-9) + 1e-9) {
      return `That's ${money(want * price)} of ${t}, but only ${money(left * price)} of it is left to sell.`;
    }
    return undefined;
  }
  const can = freeToSpendNow(state, priceOf);
  if ((tx.amount ?? 0) > can + 1e-6) {
    return `That's ${money(tx.amount ?? 0)}, but only ${money(Math.max(0, can))} is free to spend.`;
  }
  const tickers = new Set(state.holdings.filter((h) => h.units > 1e-9).map((h) => h.ticker));
  for (const o of state.pending) if (o.kind === "buy" && o.ticker) tickers.add(o.ticker);
  for (const w of Object.keys(state.waiting)) tickers.add(w);
  tickers.add(t);
  if (tickers.size > MAX_HELD) return `A portfolio can hold up to ${MAX_HELD} different stocks at once.`;
  return undefined;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Cash a "now" purchase can use: cash on hand, less what pending purchases
 * will take, plus what pending sales will bring in (at their live price, or
 * `priceOf` — the latest close — for those filling at the close).
 */
export function freeToSpendNow(state: PortfolioState, priceOf: (ticker: string) => number | undefined): number {
  const held = (t: string) => state.holdings.find((h) => h.ticker === t)?.units ?? 0;
  let n = state.cash;
  for (const o of state.pending) {
    if (o.kind === "buy") n -= o.amount;
    else if (o.kind === "sell" && o.ticker) {
      n += o.fraction !== undefined ? held(o.ticker) * o.fraction * (o.quote?.price ?? priceOf(o.ticker) ?? 0) : o.amount;
    }
  }
  return Math.max(0, n);
}

/** Estimated gain (short- and long-term) on selling `units` of `ticker` at `price` on `day`, oldest purchases first. */
export function estimateGain(state: PortfolioState, ticker: string, units: number, price: number, day: string) {
  const gain = { shortTerm: 0, longTerm: 0 };
  let left = units;
  for (const lot of state.lots.filter((l) => l.ticker === ticker).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (left <= 1e-12) break;
    const take = Math.min(left, lot.units);
    const g = take * price - lot.cost * (take / lot.units);
    gain[heldOverAYear(lot.date, day) ? "longTerm" : "shortTerm"] += g;
    left -= take;
  }
  return gain;
}
