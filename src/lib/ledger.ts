import type {
  Fill,
  Holding,
  PendingOrder,
  Portfolio,
  PortfolioState,
  Tx,
} from "@/lib/types";
import { closeOn, monthStarts, type PriceIndex } from "@/lib/prices";
import { closesAfter, nyDate } from "@/lib/market";

/**
 * Valuation model, stated plainly because it shapes every number on screen:
 *
 * - An order fills at the first market close strictly after it was placed
 *   (`placedAt`). Until that close exists in the price data the order is
 *   pending: it reserves cash but does not move the value. A trade can never
 *   use a price that was already known when the decision was made.
 * - Legacy rows with no `placedAt` (the seeded example portfolios) fill at the
 *   close of their dated day. They are labelled as examples in the UI.
 * - Cash earns nothing. No interest, no fees, no slippage, no tax. Deliberate:
 *   the comparison is about decisions, so every other variable is held fixed.
 * - Contributions are an external cash flow, not performance. `invested` tracks
 *   total money put in so return-on-invested stays honest, and the risk figures
 *   (volatility, drawdown) are measured on time-weighted returns, which strip
 *   every deposit out of the path.
 * - Fractional units throughout.
 */

export function txDate(t: Tx): string {
  return t.date;
}

type Book = { units: Map<string, number>; cash: number; rejected: string[] };

/** First index in a sorted calendar whose day is >= `day`, or -1. */
function lowerBound(calendar: string[], day: string): number {
  let lo = 0;
  let hi = calendar.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (calendar[mid] < day) lo = mid + 1;
    else hi = mid;
  }
  return lo < calendar.length ? lo : -1;
}

/**
 * Which trading day (and at what price) an order fills, or undefined while it
 * is still pending. `days` is the portfolio's own window of trading days.
 */
export function fillFor(
  index: PriceIndex,
  tx: Tx,
  days: string[],
): { day: string; price: number } | undefined {
  if (!tx.ticker) return undefined;
  if (tx.placedAt) {
    const placed = Date.parse(tx.placedAt);
    if (!Number.isFinite(placed)) return undefined;
    // Start from the New York calendar date of placement: no earlier close can
    // be after the order.
    let i = lowerBound(days, nyDate(placed));
    if (i < 0) return undefined;
    for (; i < days.length; i++) {
      const day = days[i];
      if (!closesAfter(day, tx.placedAt)) continue;
      // The ticker's own close that day. Never fall back to an older close:
      // that would be a price from before the order.
      const px = index.close(tx.ticker, day);
      if (px !== undefined && px > 0) return { day, price: px };
    }
    return undefined;
  }
  // Legacy row: fills on its dated day (or the next trading day).
  const i = lowerBound(days, tx.date);
  if (i < 0) return undefined;
  const day = days[i];
  const px = tx.price ?? closeOn(index, tx.ticker, day);
  return px !== undefined && px > 0 ? { day, price: px } : undefined;
}

function applyOrder(
  book: Book,
  tx: Tx,
  day: string,
  px: number,
): Fill | undefined {
  if (tx.kind === "buy") {
    // An order is sized either in units or in dollars. Dollars are the honest
    // default for a beginner: you decide how much of your cash to commit, and
    // the share count is whatever that buys at the close.
    const spend = tx.units && !tx.placedAt ? tx.units * px : (tx.amount ?? (tx.units ?? 0) * px);
    if (!(spend > 0)) {
      book.rejected.push(`buy ${tx.ticker} on ${day}: no amount`);
      return undefined;
    }
    if (spend > book.cash + 1e-6) {
      // A buy the account cannot fund is rejected, not clamped: silently
      // allowing negative cash would make a portfolio look better than possible.
      book.rejected.push(
        `buy ${tx.ticker} on ${day}: needs $${spend.toFixed(2)}, cash $${book.cash.toFixed(2)}`,
      );
      return undefined;
    }
    const units = spend / px;
    book.cash -= spend;
    book.units.set(tx.ticker!, (book.units.get(tx.ticker!) ?? 0) + units);
    return { date: day, price: px, units, amount: spend };
  }
  // Sell. A dollar-sized order sells that value at the fill price; legacy
  // unit-sized rows sell units. Either way, never more than is held.
  const held = book.units.get(tx.ticker!) ?? 0;
  const want = tx.placedAt
    ? tx.amount !== undefined
      ? tx.amount / px
      : (tx.units ?? 0)
    : (tx.units ?? (tx.amount ? tx.amount / px : 0));
  const units = Math.min(want, held);
  if (!(units > 0)) {
    book.rejected.push(`sell ${tx.ticker} on ${day}: nothing held`);
    return undefined;
  }
  book.cash += units * px;
  const left = held - units;
  // Snap dust from floating-point division to zero so "sell everything" does.
  book.units.set(tx.ticker!, left < 1e-9 ? 0 : left);
  return { date: day, price: px, units, amount: units * px };
}

/**
 * Put a contribution to work immediately, pro-rata to the portfolio's weights.
 *
 * Leaving a monthly deposit in cash would make a "same dollars" comparison
 * really a comparison of how much cash each portfolio happened to be holding -
 * the returns would reflect saving behaviour, not investment decisions.
 *
 * This is a standing instruction set up front, so filling it at the close of
 * the contribution day is not hindsight.
 */
function deployContribution(
  index: PriceIndex,
  book: Book,
  day: string,
  amount: number,
  weights: Record<string, number> | undefined,
): void {
  if (!weights || amount <= 0) return;
  for (const [ticker, w] of Object.entries(weights)) {
    if (!(w > 0)) continue;
    const px = closeOn(index, ticker, day);
    if (!px) {
      book.rejected.push(`contribution ${day}: no price for ${ticker}`);
      continue;
    }
    const spend = amount * w;
    if (spend > book.cash + 1e-6) continue;
    book.cash -= spend;
    book.units.set(ticker, (book.units.get(ticker) ?? 0) + spend / px);
  }
}

/** Sort key for same-day events: deposits first, then orders in placement order. */
function eventKey(tx: Tx): string {
  return `${tx.kind === "deposit" ? 0 : 1}|${tx.placedAt ?? tx.date}`;
}

export function computeState(
  index: PriceIndex,
  p: Portfolio,
  endDate: string,
): PortfolioState {
  const start = p.startDate;
  const dates = index.calendar.filter((d) => d >= start && d <= endDate);

  const book: Book = { units: new Map(), cash: 0, rejected: [] };
  const fills: Record<string, Fill> = {};
  const pendingTx: Tx[] = [];
  let invested = 0;

  // Schedule every transaction onto the day it takes effect.
  const byDay = new Map<string, Tx[]>();
  const lateDeposits: Tx[] = [];
  const fillPx = new Map<string, number>();
  for (const tx of p.tx) {
    if (tx.kind === "deposit") {
      // Cash has no price, so a deposit lands on its own trading day, or on the
      // last day in the data if it was made after that.
      const d = tx.placedAt ? nyDate(Date.parse(tx.placedAt)) : tx.date;
      const i = lowerBound(dates, d);
      const day = i >= 0 ? dates[i] : dates[dates.length - 1];
      if (day === undefined) lateDeposits.push(tx);
      else (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(tx);
      continue;
    }
    const f = fillFor(index, tx, dates);
    if (!f) {
      pendingTx.push(tx);
      continue;
    }
    fillPx.set(tx.id, f.price);
    (byDay.get(f.day) ?? byDay.set(f.day, []).get(f.day)!).push(tx);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (eventKey(a) < eventKey(b) ? -1 : eventKey(a) > eventKey(b) ? 1 : 0));
  }

  // Contribution schedule is part of the portfolio definition, not a transaction:
  // same deposit on the same day for every portfolio, so the comparison isolates
  // what was bought rather than what was saved.
  const contribDays = new Set(monthStarts(index.calendar, start, endDate));

  const values: number[] = [];
  /** External money in on each day: initial, contributions and deposits. */
  const flows: number[] = [];

  for (let i = 0; i < dates.length; i++) {
    const day = dates[i];
    let flow = 0;

    // Initial capital on day one, then the monthly contribution on each month's
    // first trading day. On day one only the initial capital lands: the first
    // monthly deposit belongs to the following month.
    if (i === 0) {
      if (p.initial > 0) {
        book.cash += p.initial;
        flow += p.initial;
        // Initial capital is NOT auto-deployed. It is allocated by the
        // portfolio's own orders, which is what makes the decision log real.
      }
    } else if (contribDays.has(day) && p.monthly > 0) {
      book.cash += p.monthly;
      flow += p.monthly;
      deployContribution(index, book, day, p.monthly, p.weights);
    }

    for (const tx of byDay.get(day) ?? []) {
      if (tx.kind === "deposit") {
        const amt = tx.amount ?? 0;
        if (amt > 0) {
          book.cash += amt;
          flow += amt;
        }
        continue;
      }
      const fill = applyOrder(book, tx, day, fillPx.get(tx.id)!);
      if (fill) fills[tx.id] = fill;
    }

    invested += flow;
    flows.push(flow);

    let holdingsValue = 0;
    for (const [ticker, units] of book.units) {
      if (units <= 1e-9) continue;
      const px = closeOn(index, ticker, day);
      if (px !== undefined) holdingsValue += units * px;
    }
    values.push(holdingsValue + book.cash);
  }

  // A portfolio created after the last day in the data has no trading days yet.
  // Its cash still exists; its orders wait.
  if (dates.length === 0) {
    if (p.initial > 0) {
      book.cash += p.initial;
      invested += p.initial;
    }
  }
  for (const tx of lateDeposits) {
    const amt = tx.amount ?? 0;
    if (amt > 0) {
      book.cash += amt;
      invested += amt;
    }
  }

  // ---- time-weighted returns ------------------------------------------------
  // r_i = (V_i - F_i) / V_{i-1} - 1, where F_i is the external money that
  // arrived on day i. A $500 deposit is not a 2% gain, and a fall that happens
  // while deposits keep arriving is still a fall.
  const rets: number[] = [];
  const twrIndex: number[] = [];
  let level = 1;
  for (let i = 0; i < values.length; i++) {
    if (i > 0 && values[i - 1] > 0) {
      const r = (values[i] - flows[i]) / values[i - 1] - 1;
      rets.push(r);
      level *= 1 + r;
    }
    twrIndex.push(level);
  }

  const drawdownSeries: number[] = [];
  let peak = -Infinity;
  for (const v of twrIndex) {
    peak = Math.max(peak, v);
    drawdownSeries.push(peak > 0 ? v / peak - 1 : 0);
  }

  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const variance =
    rets.length > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1) : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  const finalDay = dates.length ? dates[dates.length - 1] : start;
  // With trading days, every deposit is already in the path. Without any, the
  // portfolio is all cash.
  const value = values.length ? values[values.length - 1] : book.cash;

  const holdings: Holding[] = [];
  let totalHoldings = 0;
  for (const [ticker, units] of book.units) {
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

  // Pending orders reserve cash so the ticket cannot spend the same dollars twice.
  const pending: PendingOrder[] = pendingTx
    .filter((t): t is Tx & { ticker: string; kind: "buy" | "sell" } => !!t.ticker && t.kind !== "deposit")
    .map((t) => ({
      txId: t.id,
      kind: t.kind,
      ticker: t.ticker,
      amount: t.amount ?? (t.units ?? 0) * (closeOn(index, t.ticker, finalDay) ?? 0),
      placedAt: t.placedAt ?? t.date,
    }))
    .sort((a, b) => (a.placedAt < b.placedAt ? -1 : 1));
  const reserved = pending.filter((o) => o.kind === "buy").reduce((a, o) => a + o.amount, 0);

  return {
    id: p.id,
    name: p.name,
    thesis: p.thesis,
    dates,
    values,
    cash: book.cash,
    availableCash: Math.max(0, book.cash - reserved),
    invested,
    value,
    profit: value - invested,
    returnOnInvested: invested > 0 ? value / invested - 1 : 0,
    maxDrawdown: drawdownSeries.length ? Math.min(...drawdownSeries) : 0,
    holdings,
    drawdownSeries,
    twrIndex,
    twr: level - 1,
    volatility,
    lastDate: finalDay,
    rejected: book.rejected,
    pending,
    fills,
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
