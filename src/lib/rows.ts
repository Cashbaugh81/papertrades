/**
 * Mapping between Supabase rows and the engine's types. Shared by the app and
 * the nightly-close edge function, so both run the engine on the same input.
 */
import type { Database } from "@/lib/database.types";
import type { Portfolio, PriceBundle, Tx, TxKind } from "@/lib/types";

export type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];
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

export function rowToTx(r: TransactionRow): Tx {
  return {
    id: r.id,
    kind: r.kind as TxKind,
    date: r.trade_date,
    placedAt: r.placed_at ?? undefined,
    ticker: r.ticker ?? undefined,
    amount: num(r.amount),
    units: num(r.units),
    note: r.note ?? undefined,
  };
}

export function rowToPortfolio(p: PortfolioRow, txs: TransactionRow[]): Portfolio {
  const weights =
    p.weights && typeof p.weights === "object" && !Array.isArray(p.weights)
      ? Object.fromEntries(
          Object.entries(p.weights as Record<string, unknown>)
            .map(([k, v]) => [k, Number(v)] as const)
            .filter(([, v]) => Number.isFinite(v) && v > 0),
        )
      : undefined;
  return {
    id: p.id,
    name: p.name,
    thesis: p.thesis,
    startDate: p.start_date,
    initial: Number(p.initial),
    monthly: Number(p.monthly),
    weights,
    example: p.example,
    tx: txs
      .filter((t) => t.portfolio_id === p.id)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
      .map(rowToTx),
  };
}

/** Every ticker a portfolio needs prices for, including the calendar anchor. */
export function tickersFor(p: Portfolio): string[] {
  const s = new Set<string>([CALENDAR_TICKER]);
  for (const t of Object.keys(p.weights ?? {})) s.add(t);
  for (const t of p.tx) if (t.ticker) s.add(t.ticker);
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
