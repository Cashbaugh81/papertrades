// Time ranges for the charts: 1W … 10Y, YTD and All.
import type { PortfolioState } from "@/lib/types";

export type RangeKey = "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "5Y" | "10Y" | "All";
export const RANGE_KEYS: RangeKey[] = ["1W", "1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "10Y", "All"];

export const RANGE_NAMES: Record<RangeKey, string> = {
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  "6M": "6 months",
  YTD: "Year to date",
  "1Y": "1 year",
  "2Y": "2 years",
  "5Y": "5 years",
  "10Y": "10 years",
  All: "All",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** First day a range shows, counting back from `last` (YYYY-MM-DD). Undefined for All. */
export function rangeStart(key: RangeKey, last: string): string | undefined {
  if (key === "All") return undefined;
  const d = new Date(`${last}T12:00:00Z`);
  if (key === "YTD") return `${last.slice(0, 4)}-01-01`;
  if (key === "1W") d.setUTCDate(d.getUTCDate() - 7);
  else {
    const months = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "5Y": 60, "10Y": 120 }[key];
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - months);
    // Same day of the month, or the month's last day (Mar 31 − 1M = Feb 28).
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return iso(d);
}

/**
 * Which ranges can be picked for data running from `first` to `last`: every
 * range the data fully covers, plus the shortest one that reaches past its
 * start (2½ months of data: 1W, 1M and 3M), and All. The rest are greyed out.
 */
export function availableRanges(first: string, last: string): Set<RangeKey> {
  const out = new Set<RangeKey>(["All"]);
  let reach: { key: RangeKey; start: string } | undefined;
  for (const key of RANGE_KEYS) {
    const start = rangeStart(key, last);
    if (!start) continue;
    if (start >= first) out.add(key);
    else if (!reach || start > reach.start) reach = { key, start };
  }
  if (reach) out.add(reach.key);
  return out;
}

/** A portfolio's state cut to the days from `from` on, for drawing a chart. */
export function windowState(s: PortfolioState, from?: string): PortfolioState {
  if (!from || !s.dates.length || s.dates[0] >= from) return s;
  let i0 = s.dates.findIndex((d) => d >= from);
  if (i0 < 0) i0 = s.dates.length - 1;
  const cut = <T,>(a: T[]) => a.slice(i0);
  return {
    ...s,
    dates: cut(s.dates),
    values: cut(s.values),
    investedSeries: cut(s.investedSeries ?? []),
    byTicker: Object.fromEntries(Object.entries(s.byTicker).map(([t, v]) => [t, cut(v)])),
    cashSeries: cut(s.cashSeries),
    events: s.events.filter((e) => e.date >= s.dates[i0]),
  };
}
