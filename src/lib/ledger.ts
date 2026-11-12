import type {
  Holding,
  Portfolio,
  PortfolioState,
  Tx,
} from "@/lib/types";
import { closeOn, monthStarts, type PriceIndex } from "@/lib/prices";

/**
 * Valuation model, stated plainly because it shapes every number on screen:
 *
 * - Trades fill at the close of the trading day they are dated. This is a
 *   post-close review tool, so "the price you would have got" is the close.
 * - Cash earns nothing. No interest, no fees, no slippage, no tax. Deliberate:
 *   the comparison is about decisions, so every other variable is held fixed.
 * - Contributions are an external cash flow, not performance. `invested` tracks
 *   total money put in so return-on-invested stays honest.
 * - Fractional units throughout.
 */

export function txDate(t: Tx): string {
  return t.date;
}

function applyTx(
  state: { units: Map<string, number>; cash: number; rejected: string[] },
  tx: Tx,
  price: number | undefined,
): number {
  if (tx.kind === "deposit") {
    // New money entering the portfolio. Returned so the caller can add it to
    // `invested`; otherwise a top-up would look like profit.
    const amt = tx.amount ?? 0;
    if (amt > 0) {
      state.cash += amt;
      return amt;
    }
    return 0;
  }
  const px = tx.price ?? price ?? 0;
  if (!(px > 0)) {
    state.rejected.push(`${tx.kind} ${tx.ticker} on ${tx.date}: no price available`);
    return 0;
  }
  if (tx.kind === "buy") {
    // An order is sized either in units or in dollars. Dollars are the honest
    // default for a beginner: you decide how much of your cash to commit, and the
    // share count is whatever that buys at the close.
    const spend = tx.units ? tx.units * px : (tx.amount ?? 0);
    if (!(spend > 0)) {
      state.rejected.push(`buy ${tx.ticker} on ${tx.date}: no amount`);
      return 0;
    }
    if (spend > state.cash + 1e-6) {
      // A buy the account cannot fund is rejected, not clamped: silently
      // allowing negative cash would make a portfolio look better than possible.
      state.rejected.push(
        `buy ${tx.ticker} on ${tx.date}: needs $${spend.toFixed(2)}, cash $${state.cash.toFixed(2)}`,
      );
      return 0;
    }
    const bought = spend / px;
    state.cash -= spend;
    state.units.set(tx.ticker!, (state.units.get(tx.ticker!) ?? 0) + bought);
  } else if (tx.kind === "sell") {
    const held = state.units.get(tx.ticker!) ?? 0;
    const wantUnits = tx.units ?? (tx.amount ? tx.amount / px : 0);
    const sellUnits = Math.min(wantUnits, held);
    if (!(sellUnits > 0)) {
      state.rejected.push(`sell ${tx.ticker} on ${tx.date}: nothing held`);
      return 0;
    }
    state.cash += sellUnits * px;
    state.units.set(tx.ticker!, held - sellUnits);
  }
  return 0;
}

/**
 * Put a contribution to work immediately, pro-rata to the portfolio's weights.
 *
 * Leaving a monthly deposit in cash would make a "same dollars" comparison
 * really a comparison of how much cash each portfolio happened to be holding -
 * the returns would reflect saving behaviour, not investment decisions.
 */
function deployContribution(
  index: PriceIndex,
  state: { units: Map<string, number>; cash: number; rejected: string[] },
  day: string,
  amount: number,
  weights: Record<string, number> | undefined,
): void {
  if (!weights || amount <= 0) return;
  for (const [ticker, w] of Object.entries(weights)) {
    if (!(w > 0)) continue;
    const px = closeOn(index, ticker, day);
    if (!px) {
      state.rejected.push(`contribution ${day}: no price for ${ticker}`);
      continue;
    }
    const spend = amount * w;
    if (spend > state.cash + 1e-6) continue;
    state.cash -= spend;
    state.units.set(ticker, (state.units.get(ticker) ?? 0) + spend / px);
  }
}

export function computeState(
  index: PriceIndex,
  p: Portfolio,
  endDate: string,
): PortfolioState {
  const start = p.startDate;
  const calendar = index.calendar.filter((d) => d >= start && d <= endDate);
  const dates = calendar.length ? calendar : [];

  const state = { units: new Map<string, number>(), cash: 0, rejected: [] as string[] };
  const sorted = [...p.tx].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Contribution schedule is part of the portfolio definition, not a transaction:
  // same deposit on the same day for every portfolio, so the comparison isolates
  // what was bought rather than what was saved.
  const contribDays = monthStarts(index.calendar, start, endDate);
  const contrib = new Map(contribDays.map((d) => [d, p.monthly]));

  let invested = 0;
  let ti = 0;
  const values: number[] = [];
  const drawdownSeries: number[] = [];

  for (let i = 0; i < dates.length; i++) {
    const day = dates[i];

    // Initial capital, then the monthly contribution on each month's first
    // trading day. On day one only the initial capital lands: the first monthly
    // deposit belongs to the following month, otherwise a starter's first
    // statement shows money they never put in.
    if (i === 0) {
      if (p.initial > 0) {
        state.cash += p.initial;
        invested += p.initial;
        // Initial capital is NOT auto-deployed. It is allocated by the portfolio's
        // own dated buy transactions, which is what makes the decision log real.
        // Monthly contributions below are what use the weights.
      }
    } else if (contrib.has(day)) {
      const c = contrib.get(day)!;
      state.cash += c;
      invested += c;
      // Deploy the same day at that day's close, so the monthly deposit buys
      // the strategy instead of piling up as idle cash.
      deployContribution(index, state, day, c, p.weights);
    }

    while (ti < sorted.length && sorted[ti].date <= day) {
      const tx = sorted[ti];
      if (tx.date <= day) {
        // A cash deposit is new money in, so it raises `invested`. Trades return 0.
        invested += applyTx(state, tx, tx.ticker ? closeOn(index, tx.ticker, day) : undefined);
        ti++;
      }
    }

    let holdingsValue = 0;
    for (const [ticker, units] of state.units) {
      if (units <= 1e-9) continue;
      const px = closeOn(index, ticker, day);
      if (px !== undefined) holdingsValue += units * px;
    }
    values.push(holdingsValue + state.cash);
  }

  let peak = -Infinity;
  for (const v of values) {
    peak = Math.max(peak, v);
    drawdownSeries.push(peak > 0 ? v / peak - 1 : 0);
  }

  const value = values.length ? values[values.length - 1] : state.cash;
  const finalDay = dates.length ? dates[dates.length - 1] : start;

  const holdings: Holding[] = [];
  let totalHoldings = 0;
  for (const [ticker, units] of state.units) {
    if (units <= 1e-9) continue;
    const px = closeOn(index, ticker, finalDay) ?? 0;
    const v = units * px;
    totalHoldings += v;
    holdings.push({ ticker, units, price: px, value: v, weight: 0, cost: 0 });
  }
  for (const h of holdings) {
    h.weight = totalHoldings > 0 ? h.value / totalHoldings : 0;
  }
  holdings.sort((a, b) => b.value - a.value);

  // Daily returns -> annualised volatility. Uses the portfolio's own path, so a
  // lumpy contribution does not masquerade as risk: we measure the return of the
  // *units held*, not the account balance.
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) rets.push(values[i] / values[i - 1] - 1);
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const variance = rets.length
    ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length
    : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  return {
    id: p.id,
    name: p.name,
    thesis: p.thesis,
    dates,
    values,
    cash: state.cash,
    invested,
    value,
    profit: value - invested,
    returnOnInvested: invested > 0 ? value / invested - 1 : 0,
    maxDrawdown: drawdownSeries.length ? Math.min(...drawdownSeries) : 0,
    holdings,
    drawdownSeries,
    volatility,
    lastDate: finalDay,
    rejected: state.rejected,
  };
}

export function computeAll(
  index: PriceIndex,
  portfolios: Portfolio[],
  endDate: string,
): PortfolioState[] {
  return portfolios.map((p) => computeState(index, p, endDate));
}

/** The boring benchmark every portfolio is judged against on the detail view. */
export function baselineId(states: PortfolioState[]): string | undefined {
  const boring = states.find((s) => /boring|baseline|index/i.test(s.name));
  return (boring ?? states[0])?.id;
}

export function humanDate(d: string): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shortDate(d: string): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00Z");
  const month = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  // "Nov '23", not "Nov 23" - the latter reads as a day of the month.
  const yy = String(dt.getUTCFullYear()).slice(2);
  return `${month} '${yy}`;
}

export function money(n: number, decimals = 0): string {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}$${v}`;
}

export function pct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

export function signedPct(n: number, decimals = 1): string {
  const v = (n * 100).toFixed(decimals);
  return `${n > 0 ? "+" : ""}${v}%`;
}

/**
 * How many days of history a portfolio has. Used to warn when a comparison is
 * being read across unequal windows - the single easiest way for a tracker like
 * this to mislead its own author.
 */
export function historyDays(dates: string[]): number {
  if (dates.length < 2) return 0;
  const a = new Date(dates[0] + "T00:00:00Z").getTime();
  const b = new Date(dates[dates.length - 1] + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}
