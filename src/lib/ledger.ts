import type {
  Lot,
  RealizedGain,
  TaxSummary,
  TimelineEvent,
  Fill,
  Holding,
  PendingOrder,
  Portfolio,
  PortfolioState,
  Tx,
} from "@/lib/types";
import { closeOn, monthStarts, weekStarts, type PriceIndex } from "@/lib/prices";
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
 * - A stock that hadn't started trading yet on the day money goes into it
 *   (its first close is later): its share is set aside as cash and buys in at
 *   the close of its first trading day. The rest of the mix is invested as
 *   usual. Contributions do the same for that stock's share.
 */

export function txDate(t: Tx): string {
  return t.date;
}

type Book = {
  units: Map<string, number>;
  cash: number;
  rejected: string[];
  /** The mix contributions follow: the last filled rebalance, else the portfolio's weights. */
  weights?: Record<string, number>;
  /** Cash set aside for stocks that haven't started trading yet, by ticker. */
  waiting: Map<string, number>;
  /** Purchases still held, oldest first, by ticker: for cost basis and taxes. */
  lots: Map<string, Lot[]>;
  /** Gains and losses from sales so far. */
  realized: RealizedGain[];
};

/** Record a purchase as a tax lot. */
function addLot(book: Book, ticker: string, day: string, units: number, cost: number): void {
  if (!(units > 0)) return;
  const list = book.lots.get(ticker) ?? [];
  list.push({ ticker, date: day, units, cost });
  book.lots.set(ticker, list);
}

/** True when a purchase on `bought` was held more than a year by `sold` (long-term). */
export function heldOverAYear(bought: string, sold: string): boolean {
  const [y, m, d] = bought.split("-").map(Number);
  const anniversary = `${String(y + 1).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return sold > anniversary;
}

/** Sell `units` of `ticker` at `px`, oldest purchases first, recording the gain on each. */
function sellLots(book: Book, ticker: string, units: number, px: number, day: string): void {
  const list = book.lots.get(ticker) ?? [];
  let left = units;
  while (left > 1e-12 && list.length) {
    const lot = list[0];
    const take = Math.min(left, lot.units);
    const cost = lot.cost * (take / lot.units);
    book.realized.push({
      ticker,
      bought: lot.date,
      sold: day,
      proceeds: take * px,
      cost,
      gain: take * px - cost,
      longTerm: heldOverAYear(lot.date, day),
    });
    lot.units -= take;
    lot.cost -= cost;
    left -= take;
    if (lot.units <= 1e-12) list.shift();
  }
  if (list.length) book.lots.set(ticker, list);
  else book.lots.delete(ticker);
}

/** True once `ticker` has traded on or before `day`. */
function listedBy(index: PriceIndex, ticker: string, day: string): boolean {
  return closeOn(index, ticker, day) !== undefined;
}

/** Cash set aside for unlisted stocks, in total. */
function waitingTotal(book: Book): number {
  let n = 0;
  for (const v of book.waiting.values()) n += v;
  return n;
}

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
  if (tx.kind === "rebalance") return rebalanceDay(index, tx, days);
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

/**
 * A mix change fills at the first close (after it was placed) where every
 * ticker in the new mix has its own close, so nothing is bought at a stale
 * price. Legacy rows (no placedAt: a what-if's first mix) fill on their date.
 * A ticker that hasn't started trading yet doesn't hold the mix up: its share
 * waits in cash (see applyRebalance).
 */
function rebalanceDay(index: PriceIndex, tx: Tx, days: string[]): { day: string; price: number } | undefined {
  const tickers = Object.keys(tx.weights ?? {});
  if (tickers.length === 0) return undefined;
  const allClose = (day: string) =>
    tickers.every((t) => (index.close(t, day) ?? 0) > 0 || !listedBy(index, t, day));
  if (tx.placedAt) {
    const placed = Date.parse(tx.placedAt);
    if (!Number.isFinite(placed)) return undefined;
    const i = lowerBound(days, nyDate(placed));
    if (i < 0) return undefined;
    for (let k = i; k < days.length; k++) {
      if (closesAfter(days[k], tx.placedAt) && allClose(days[k])) return { day: days[k], price: 0 };
    }
    return undefined;
  }
  const i = lowerBound(days, tx.date);
  if (i < 0) return undefined;
  for (let k = i; k < days.length; k++) if (allClose(days[k])) return { day: days[k], price: 0 };
  return undefined;
}

/**
 * Move everything (cash and holdings, valued at this close) into the new mix.
 * Never rejected: with nothing to move it simply sets the mix that later
 * contributions follow.
 */
function applyRebalance(index: PriceIndex, book: Book, tx: Tx, day: string): Fill {
  let total = book.cash + waitingTotal(book);
  for (const [t, u] of book.units) {
    if (u <= 1e-12) continue;
    const px = closeOn(index, t, day) ?? 0;
    total += u * px;
    sellLots(book, t, u, px, day); // a mix change sells what's held
  }
  book.units = new Map();
  book.waiting = new Map();
  book.cash = 0;
  const weights = tx.weights ?? {};
  // A mix bought by shares can add up to less than 100%: the rest stays cash.
  const invested = Object.values(weights).reduce((a, w) => a + w, 0);
  book.cash = invested < 1 - 1e-9 ? total * (1 - invested) : 0;
  for (const [t, w] of Object.entries(weights)) {
    // rebalanceDay guarantees a close, unless the ticker hasn't started trading.
    const px = index.close(t, day);
    if (px !== undefined && px > 0) {
      book.units.set(t, (total * w) / px);
      addLot(book, t, day, (total * w) / px, total * w);
    } else book.waiting.set(t, total * w);
  }
  book.weights = weights;
  const waited = [...book.waiting.keys()].sort();
  return { date: day, price: 0, units: 0, amount: total, ...(waited.length ? { waited } : {}) };
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
    addLot(book, tx.ticker!, day, units, spend);
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
  sellLots(book, tx.ticker!, units, px, day);
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
    const spend = amount * w;
    if (spend > book.cash + 1e-6) continue;
    book.cash -= spend;
    if (!px) {
      // Not trading yet: its share waits in cash with the rest set aside for it.
      book.waiting.set(ticker, (book.waiting.get(ticker) ?? 0) + spend);
      continue;
    }
    book.units.set(ticker, (book.units.get(ticker) ?? 0) + spend / px);
    addLot(book, ticker, day, spend / px, spend);
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

  const book: Book = {
    units: new Map(),
    cash: 0,
    rejected: [],
    weights: p.weights,
    waiting: new Map(),
    lots: new Map(),
    realized: [],
  };
  /** Each holding's value and the cash (incl. cash set aside) at each close. */
  const byTicker: Record<string, number[]> = {};
  const cashSeries: number[] = [];
  /** When each set-aside stock bought in: ticker → its first trading day. */
  const boughtIn: Record<string, string> = {};
  const fills: Record<string, Fill> = {};
  const rejections: PortfolioState["rejections"] = {};
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
  const contribAmount = new Map<string, number>();
  if ((p.monthly ?? 0) > 0) {
    for (const d of monthStarts(index.calendar, start, endDate)) {
      contribAmount.set(d, (contribAmount.get(d) ?? 0) + p.monthly!);
    }
  }
  if ((p.weekly ?? 0) > 0) {
    for (const d of weekStarts(index.calendar, start, endDate)) {
      contribAmount.set(d, (contribAmount.get(d) ?? 0) + p.weekly!);
    }
  }

  const values: number[] = [];
  /** External money in on each day: initial, contributions and deposits. */
  const flows: number[] = [];

  for (let i = 0; i < dates.length; i++) {
    const day = dates[i];
    let flow = 0;

    // A stock that starts trading today buys in with the cash set aside for it.
    for (const [t, amt] of book.waiting) {
      const px = index.close(t, day);
      if (px === undefined || !(px > 0)) continue;
      book.units.set(t, (book.units.get(t) ?? 0) + amt / px);
      addLot(book, t, day, amt / px, amt);
      book.waiting.delete(t);
      boughtIn[t] = day;
    }

    // Initial capital on day one, then the weekly (or monthly) contribution on
    // each period's first trading day. On day one only the initial capital
    // lands: the first contribution belongs to the following period.
    if (i === 0) {
      if (p.initial > 0) {
        book.cash += p.initial;
        flow += p.initial;
        // Initial capital is NOT auto-deployed. It is allocated by the
        // portfolio's own orders, which is what makes the decision log real.
      }
    } else {
      const amt = contribAmount.get(day) ?? 0;
      if (amt > 0) {
        book.cash += amt;
        flow += amt;
        deployContribution(index, book, day, amt, book.weights);
      }
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
      if (tx.kind === "rebalance") {
        fills[tx.id] = applyRebalance(index, book, tx, day);
        continue;
      }
      const before = book.rejected.length;
      const fill = applyOrder(book, tx, day, fillPx.get(tx.id)!);
      if (fill) fills[tx.id] = fill;
      else if (book.rejected.length > before) {
        rejections[tx.id] = { date: day, reason: book.rejected[book.rejected.length - 1] };
      }
    }

    invested += flow;
    flows.push(flow);

    let holdingsValue = 0;
    for (const [ticker, units] of book.units) {
      if (units <= 1e-9) continue;
      const px = closeOn(index, ticker, day);
      if (px !== undefined) holdingsValue += units * px;
    }
    values.push(holdingsValue + book.cash + waitingTotal(book));
    cashSeries.push(book.cash + waitingTotal(book));
    for (const [ticker, units] of book.units) {
      if (units <= 1e-9 && !byTicker[ticker]) continue;
      const arr = (byTicker[ticker] ??= new Array(i).fill(0));
      arr.push(units > 1e-9 ? units * (closeOn(index, ticker, day) ?? 0) : 0);
    }
    for (const arr of Object.values(byTicker)) if (arr.length < i + 1) arr.push(0);
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

  // Biggest bump: the largest rise from a low point to a later high (the
  // mirror of the biggest drop), on the same deposit-free index.
  let maxRunUp = 0;
  let runFrom = 0;
  let runTo = 0;
  let low = Infinity;
  let lowAt = 0;
  twrIndex.forEach((v, i) => {
    if (v < low) {
      low = v;
      lowAt = i;
    }
    const up = low > 0 ? v / low - 1 : 0;
    if (up > maxRunUp) {
      maxRunUp = up;
      runFrom = lowAt;
      runTo = i;
    }
  });

  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const variance =
    rets.length > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1) : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  const finalDay = dates.length ? dates[dates.length - 1] : start;
  // With trading days, every deposit is already in the path. Without any, the
  // portfolio is all cash.
  const value = values.length ? values[values.length - 1] : book.cash + waitingTotal(book);

  const holdings: Holding[] = [];
  let totalHoldings = 0;
  for (const [ticker, units] of book.units) {
    if (units <= 1e-9) continue;
    const px = closeOn(index, ticker, finalDay) ?? 0;
    const v = units * px;
    totalHoldings += v;
    const cost = (book.lots.get(ticker) ?? []).reduce((a, l) => a + l.cost, 0);
    holdings.push({ ticker, units, price: px, value: v, weight: 0, cost });
  }
  for (const h of holdings) {
    h.weight = totalHoldings > 0 ? h.value / totalHoldings : 0;
  }
  holdings.sort((a, b) => b.value - a.value);

  // Pending orders reserve cash so the ticket cannot spend the same dollars twice.
  const pending: PendingOrder[] = pendingTx
    .filter((t) => t.kind !== "deposit" && (t.kind === "rebalance" || !!t.ticker))
    .map((t) =>
      t.kind === "rebalance"
        ? { txId: t.id, kind: "rebalance" as const, amount: 0, weights: t.weights, placedAt: t.placedAt ?? t.date }
        : {
            txId: t.id,
            kind: t.kind as "buy" | "sell",
            ticker: t.ticker!,
            amount: t.amount ?? (t.units ?? 0) * (closeOn(index, t.ticker!, finalDay) ?? 0),
            placedAt: t.placedAt ?? t.date,
          },
    )
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
    rejections,
    currentWeights: book.weights,
    waiting: Object.fromEntries(book.waiting),
    boughtIn,
    maxRunUp,
    maxRunUpDates: twrIndex.length ? [dates[runFrom], dates[runTo]] : undefined,
    maxDrawdownDates: drawdownDates(twrIndex, dates),
    byTicker,
    cashSeries,
    lots: [...book.lots.values()].flat().map((l) => ({ ...l })),
    realized: book.realized,
    taxes: taxSummary(index, [...book.lots.values()].flat(), book.realized, finalDay),
    events: timeline(p, fills, boughtIn),
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

/** A mix as text, biggest share first: "NVDA 50% · SMH 50%". */
export function mixLabel(mix?: Record<string, number>): string {
  if (!mix) return "—";
  const parts = Object.entries(mix)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([t, w]) => `${t} ${Math.round(w * 1000) / 10}%`);
  const cash = 1 - Object.values(mix).reduce((a, w) => a + w, 0);
  if (cash >= 0.0005) parts.push(`Cash ${Math.round(cash * 1000) / 10}%`);
  return parts.join(" · ");
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

/** The low and the high before it that make the biggest drop. */
function drawdownDates(twr: number[], dates: string[]): [string, string] | undefined {
  if (!twr.length) return undefined;
  let peak = twr[0];
  let peakAt = 0;
  let worst = 0;
  let from = 0;
  let to = 0;
  twr.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      peakAt = i;
    }
    const dd = peak > 0 ? v / peak - 1 : 0;
    if (dd < worst) {
      worst = dd;
      from = peakAt;
      to = i;
    }
  });
  return worst < 0 ? [dates[from], dates[to]] : undefined;
}

/** Tax rates used for estimates: long-term (held over a year) and short-term gains. */
export const TAX_RATES = { longTerm: 0.15, shortTerm: 0.24 } as const;

/**
 * Tax on net gains, US-style: short- and long-term gains are netted
 * separately, a net loss in one offsets a net gain in the other, and a net
 * loss owes nothing.
 */
export function taxOn(shortTerm: number, longTerm: number): number {
  let st = shortTerm;
  let lt = longTerm;
  if (st < 0 && lt > 0) {
    lt += st;
    st = 0;
  } else if (lt < 0 && st > 0) {
    st += lt;
    lt = 0;
  }
  return Math.max(0, st) * TAX_RATES.shortTerm + Math.max(0, lt) * TAX_RATES.longTerm;
}

/** Potential tax (if everything were sold at the last close) and actual tax (on sales so far). */
function taxSummary(index: PriceIndex, lots: Lot[], realized: RealizedGain[], day: string): TaxSummary {
  let unrealizedShort = 0;
  let unrealizedLong = 0;
  for (const l of lots) {
    const gain = l.units * (closeOn(index, l.ticker, day) ?? 0) - l.cost;
    if (heldOverAYear(l.date, day)) unrealizedLong += gain;
    else unrealizedShort += gain;
  }
  let realizedShort = 0;
  let realizedLong = 0;
  for (const r of realized) {
    if (r.longTerm) realizedLong += r.gain;
    else realizedShort += r.gain;
  }
  return {
    unrealizedShort,
    unrealizedLong,
    potentialTax: taxOn(unrealizedShort, unrealizedLong),
    realizedShort,
    realizedLong,
    actualTax: taxOn(realizedShort, realizedLong),
  };
}

/** The things that happened to a portfolio, in order: its first mix, mix changes, waits and buy-ins, orders. */
function timeline(p: Portfolio, fills: Record<string, Fill>, boughtIn: Record<string, string>): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  let first = true;
  for (const tx of p.tx) {
    const f = fills[tx.id];
    if (!f) continue;
    if (tx.kind === "rebalance") {
      out.push({ date: f.date, kind: first ? "start" : "mix", weights: tx.weights, amount: f.amount });
      if (f.waited?.length) out.push({ date: f.date, kind: "waiting", tickers: f.waited });
      first = false;
    } else if (tx.kind === "buy" || tx.kind === "sell") {
      out.push({ date: f.date, kind: tx.kind, tickers: [tx.ticker!], amount: f.amount });
    }
  }
  for (const [t, day] of Object.entries(boughtIn)) out.push({ date: day, kind: "bought_in", tickers: [t] });
  const order = { start: 0, waiting: 1, mix: 2, buy: 3, sell: 3, bought_in: 4 } as const;
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order[a.kind] - order[b.kind]));
}
