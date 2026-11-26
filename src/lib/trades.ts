// Trades (buys and sells) on top of a portfolio's history: checking a new trade
// or a deletion against the whole history, and what's available on a date.
// Shared by the trade dialog (preview) and the server (the final say), so the
// two always agree.
import { computeState } from "@/lib/ledger";
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
