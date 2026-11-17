// Fetch a ticker's adjusted closes from Tiingo and store them. Used by both
// `prices` (on demand) and `nightly-close` (the tickers in use).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  HISTORY_START,
  incrementalStart,
  isFresh,
  lastCutoff,
  needsFullRefetch,
  parseBars,
} from "./engine.js";

const TIINGO = "https://api.tiingo.com/tiingo/daily";

export type TickerInfo = {
  ticker: string;
  name: string | null;
  status: "ok" | "not_found" | "error";
  first_date: string | null;
  last_date: string | null;
  fetched_at: string | null;
  error: string | null;
};

type Bar = { date: string; adjClose: number };

class NotFound extends Error {}

/** Counts Tiingo requests, so a caller can stay inside the hourly limit. */
export type CallCounter = { calls: number };

/** The most Tiingo requests one refreshTicker can make (metadata, its upper-case retry, incremental, full). */
export const MAX_CALLS_PER_TICKER = 4;

/**
 * The ticker as it goes into a Tiingo URL. Lower case normally; upper case
 * for tickers whose lower-case path Tiingo refuses ("meta" collides with its
 * own route, so /tiingo/daily/meta is a 404 while /tiingo/daily/META works).
 */
function pathOf(ticker: string, upper = UPPER_CASE_PATHS.has(ticker)): string {
  return encodeURIComponent(upper ? ticker.toUpperCase() : ticker.toLowerCase());
}
const UPPER_CASE_PATHS = new Set(["META"]);

async function tiingo(path: string, token: string, counter?: CallCounter): Promise<unknown> {
  if (counter) counter.calls++;
  const res = await fetch(`${TIINGO}/${path}`, {
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
  });
  if (res.status === 404) throw new NotFound("not found");
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Tiingo ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchBars(ticker: string, start: string, token: string, counter?: CallCounter): Promise<Bar[]> {
  const json = await tiingo(
    `${pathOf(ticker)}/prices?startDate=${start}&resampleFreq=daily`,
    token,
    counter,
  );
  return parseBars(json) as Bar[];
}

async function storedSince(db: SupabaseClient, ticker: string, from: string): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("prices")
    .select("date, close")
    .eq("ticker", ticker)
    .gte("date", from)
    .order("date");
  if (error) throw error;
  return new Map((data ?? []).map((r: { date: string; close: number | string }) => [r.date, Number(r.close)]));
}

async function writeBars(db: SupabaseClient, ticker: string, bars: Bar[]): Promise<void> {
  for (let i = 0; i < bars.length; i += 1000) {
    const chunk = bars.slice(i, i + 1000).map((b) => ({ ticker, date: b.date, close: b.adjClose }));
    const { error } = await db.from("prices").upsert(chunk, { onConflict: "ticker,date" });
    if (error) throw error;
  }
}

async function saveInfo(db: SupabaseClient, info: TickerInfo): Promise<TickerInfo> {
  const { error } = await db.from("tickers").upsert(info, { onConflict: "ticker" });
  if (error) throw error;
  return info;
}

/**
 * Make sure `ticker` has current closes in the cache. Returns its info row.
 * `db` must be a service-role client: only the server writes prices.
 */
export async function refreshTicker(
  db: SupabaseClient,
  ticker: string,
  token: string,
  opts: { now?: number; counter?: CallCounter } = {},
): Promise<TickerInfo> {
  const now = opts.now ?? Date.now();
  const counter = opts.counter;
  const nowIso = new Date(now).toISOString();
  const { data: existing, error } = await db.from("tickers").select("*").eq("ticker", ticker).maybeSingle();
  if (error) throw error;
  const meta = existing as TickerInfo | null;
  if (meta && isFresh(meta, now, lastCutoff(now))) return meta;

  try {
    let full = !meta || meta.status !== "ok" || !meta.last_date;
    let name = meta?.name ?? null;

    if (full && !name) {
      // One-off metadata call for a ticker we've never had: its name, and a
      // clean "not found" for typos.
      // A 404 in lower case gets one retry in upper case (see pathOf).
      let m: { name?: string };
      try {
        m = (await tiingo(pathOf(ticker), token, counter)) as { name?: string };
      } catch (e) {
        if (!(e instanceof NotFound) || UPPER_CASE_PATHS.has(ticker)) throw e;
        m = (await tiingo(pathOf(ticker, true), token, counter)) as { name?: string };
        UPPER_CASE_PATHS.add(ticker);
      }
      name = typeof m?.name === "string" ? m.name.trim() || null : null;
    }

    let bars: Bar[] = [];
    if (!full) {
      const start = incrementalStart(meta!.last_date!);
      bars = await fetchBars(ticker, start, token, counter);
      if (needsFullRefetch(await storedSince(db, ticker, start), bars)) full = true;
    }
    if (full) bars = await fetchBars(ticker, HISTORY_START, token, counter);

    if (bars.length === 0) {
      if (meta?.status === "ok") {
        // Nothing new (a holiday, or Tiingo is late). Keep what we have.
        return await saveInfo(db, { ...meta, fetched_at: nowIso, error: null });
      }
      return await saveInfo(db, {
        ticker, name, status: "not_found", first_date: null, last_date: null, fetched_at: nowIso,
        error: "no daily prices",
      });
    }

    // The tickers row must exist before prices reference it.
    const info: TickerInfo = {
      ticker,
      name,
      status: "ok",
      first_date: full ? bars[0].date : (meta!.first_date ?? bars[0].date),
      last_date: bars[bars.length - 1].date,
      fetched_at: null, // set after the prices are written
      error: null,
    };
    if (!meta) {
      // A placeholder marked "error" until the prices are in: if the write
      // fails partway, the next attempt starts again from scratch.
      await saveInfo(db, { ...info, status: "error", error: "loading", last_date: null, first_date: null });
    }
    await writeBars(db, ticker, bars);
    return await saveInfo(db, { ...info, fetched_at: nowIso });
  } catch (e) {
    if (e instanceof NotFound) {
      return await saveInfo(db, {
        ticker, name: meta?.name ?? null, status: "not_found", first_date: null, last_date: null,
        fetched_at: nowIso, error: "Tiingo has no ticker by that name",
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (meta?.status === "ok") {
      // Keep serving the data we have; record the error, retry next time.
      return await saveInfo(db, { ...meta, error: msg.slice(0, 300) });
    }
    return await saveInfo(db, {
      ticker, name: meta?.name ?? null, status: "error", first_date: null, last_date: null,
      fetched_at: nowIso, error: msg.slice(0, 300),
    });
  }
}
