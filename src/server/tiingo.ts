/**
 * Tiingo end-of-day prices: parsing and the refresh decision. No I/O here, so
 * it can be tested; the edge functions do the fetching and writing.
 *
 * We store `adjClose` (split- and dividend-adjusted), so a path's value
 * includes dividends. Tiingo rewrites the whole adjusted history whenever a
 * dividend or split happens, so an incremental fetch must check that the days
 * it overlaps still match what we stored. If they don't, refetch everything.
 */

import { nyDate } from "@/lib/market";

export const HISTORY_START = "2000-01-01";
/** Days of overlap re-fetched on an incremental refresh, to detect re-adjustment. */
export const OVERLAP_DAYS = 10;
/** Relative difference that counts as a re-adjustment. */
export const ADJ_TOLERANCE = 1e-5; // prices are stored to 6 dp

export const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

export function normaliseTicker(raw: string): string | undefined {
  const t = raw.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : undefined;
}

export type TiingoBar = { date: string; adjClose: number };

/** Tiingo price rows -> sorted, de-duplicated [date, adjClose] pairs. */
export function parseBars(json: unknown): TiingoBar[] {
  if (!Array.isArray(json)) throw new Error("unexpected Tiingo response");
  const byDate = new Map<string, number>();
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const date = typeof r.date === "string" ? r.date.slice(0, 10) : undefined;
    const px = Number(r.adjClose);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(px) && px > 0) {
      byDate.set(date, px);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, adjClose]) => ({ date, adjClose }));
}

/** Where an incremental fetch should start: OVERLAP_DAYS before the last stored day. */
export function incrementalStart(lastDate: string): string {
  const t = Date.parse(`${lastDate}T00:00:00Z`) - OVERLAP_DAYS * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * True if any day present in both `stored` and `fresh` disagrees: Tiingo has
 * re-adjusted the history since we stored it.
 */
export function needsFullRefetch(stored: Map<string, number>, fresh: TiingoBar[]): boolean {
  let overlap = 0;
  for (const b of fresh) {
    const old = stored.get(b.date);
    if (old === undefined) continue;
    overlap++;
    if (Math.abs(b.adjClose / old - 1) > ADJ_TOLERANCE) return true;
  }
  // No overlap at all means we can't tell; be safe.
  return stored.size > 0 && overlap === 0;
}

/** How long to wait before asking Tiingo again for a close it didn't have yet. */
export const RETRY_AFTER_MS = 45 * 60_000;
/** How long after the cutoff to keep retrying a missing close (late data, holidays). */
export const RETRY_FOR_MS = 4 * 3_600_000;

/**
 * Whether a cached ticker is fresh enough to skip fetching.
 * - Unknown tickers ("not_found") are retried after a day; errors after an hour.
 * - A good ticker is fresh once it has the close of the cutoff's day.
 * - If it was checked after the cutoff but that close wasn't out yet, it's
 *   retried every 45 minutes for the first 4 hours after the cutoff, then left
 *   until the next cutoff (a holiday, or a ticker that has stopped trading).
 */
export function isFresh(
  row: { status: string; fetched_at: string | null; last_date?: string | null } | undefined,
  now: number,
  lastCutoff: number,
): boolean {
  if (!row?.fetched_at) return false;
  const fetched = Date.parse(row.fetched_at);
  if (row.status === "not_found") return now - fetched < 86_400_000;
  if (row.status === "error") return now - fetched < 3_600_000;
  if (fetched < lastCutoff) return false;
  if (row.last_date && row.last_date >= nyDate(lastCutoff)) return true;
  return now - fetched < RETRY_AFTER_MS || fetched - lastCutoff > RETRY_FOR_MS;
}
