/**
 * Mapping between Supabase rows and the engine's types. Shared by the app and
 * the nightly-close edge function, so both run the engine on the same input.
 */
import type { Database } from "@/lib/database.types";
import type { Portfolio, PriceBundle, StartQuote, Tx, TxKind } from "@/lib/types";

export type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
export type SetRow = Database["public"]["Tables"]["comparison_sets"]["Row"];
export type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];

/**
 * The calendar anchor. The engine's trading calendar is the union of the
 * dates of every series it is given, and monthly contributions land on each
 * month's first calendar day. Always including SPY means the app and the
 * server agree on that calendar, whatever else a portfolio holds.
 */
export const CALENDAR_TICKER = "SPY";

const num = (v: number | string | null | undefined): number | undefined =>
  v === null || v === undefined ? undefined : Number(v);

/** A stored mix -> {TICKER: fraction}, dropping anything malformed. */
export function toWeights(v: unknown): Record<string, number> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out = Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => [k, Number(x)] as const)
      .filter(([, x]) => Number.isFinite(x) && x > 0),
  );
  return Object.keys(out).length ? out : undefined;
}

export function rowToTx(r: TransactionRow): Tx {
  return {
    id: r.id,
    kind: r.kind as TxKind,
    date: r.trade_date,
    placedAt: r.placed_at ?? undefined,
    ...(toQuote(r.quote) ? { quote: toQuote(r.quote) } : {}),
    ticker: r.ticker ?? undefined,
    amount: num(r.amount),
    units: num(r.units),
    ...(num(r.fraction) !== undefined ? { fraction: num(r.fraction) } : {}),
    note: r.note ?? undefined,
    weights: r.kind === "rebalance" ? toWeights(r.weights) : undefined,
  };
}

/**
 * A column of a comparison set. Its starting amount and weekly amount come
 * from the set; its first mix is its first rebalance transaction.
 */
export function rowToPortfolio(p: PortfolioRow, set: Pick<SetRow, "initial" | "weekly">, txs: TransactionRow[]): Portfolio {
  return {
    id: p.id,
    name: p.name,
    thesis: p.thesis,
    startDate: p.start_date,
    initial: Number(set.initial),
    weekly: Number(set.weekly),
    ...(toQuotes(p.start_quotes) ? { startQuotes: toQuotes(p.start_quotes) } : {}),
    tx: txs
      .filter((t) => t.portfolio_id === p.id)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
      .map(rowToTx),
  };
}

/** Live purchase prices as stored, keeping only well-formed entries. */
export function toQuotes(v: unknown): Record<string, StartQuote> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, StartQuote> = {};
  for (const [t, q] of Object.entries(v as Record<string, unknown>)) {
    const o = q as { price?: unknown; at?: unknown; ratio?: unknown } | null;
    const price = Number(o?.price);
    const ratio = Number(o?.ratio);
    if (!(price > 0) || typeof o?.at !== "string") continue;
    out[t] = { price, at: o.at, ...(ratio > 0 ? { ratio } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Every ticker a portfolio needs prices for, including the calendar anchor. */
export function tickersFor(p: Portfolio): string[] {
  const s = new Set<string>([CALENDAR_TICKER]);
  for (const t of Object.keys(p.weights ?? {})) s.add(t);
  for (const t of p.tx) {
    if (t.ticker) s.add(t.ticker);
    for (const k of Object.keys(t.weights ?? {})) s.add(k);
  }
  return [...s].sort();
}

/** Rows from the `price_series` RPC, as a bundle the engine can index. */
export type SeriesRow = { ticker: string; dates: string[]; closes: (number | string)[] };

export function seriesToBundle(rows: SeriesRow[], source = "supabase"): PriceBundle {
  const series: PriceBundle["series"] = {};
  let generated = "";
  for (const r of rows) {
    series[r.ticker] = { dates: r.dates, closes: r.closes.map(Number) };
    const last = r.dates[r.dates.length - 1];
    if (last && last > generated) generated = last;
  }
  return { generated, source, series };
}

/** One live price as stored on a "now" trade, or undefined if malformed. */
export function toQuote(v: unknown): StartQuote | undefined {
  return toQuotes({ q: v })?.q;
}
