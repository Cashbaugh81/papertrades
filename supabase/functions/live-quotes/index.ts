// POST /functions/v1/live-quotes
//   { action: "quote", tickers: string[] }  →  { open, quotes: { T: { price, at } } }
//   { action: "start", setId: string }      →  { open, locked: { slot: { T: { price, at } } } }
//
// Live prices from Tiingo's IEX feed, for a signed-in user, during market
// hours only (9:30–16:00 New York on a trading day, judged by the quotes'
// own timestamps so holidays count as closed).
// - "quote" shows what a share costs right now (the Shares box in the editor).
// - "start" locks those prices in as the purchase price of a live comparison
//   just created by its owner: one time, within a few minutes of creating it,
//   so a price can't be picked later with hindsight. Tickers Tiingo has no
//   live price for (mutual funds) keep buying at that day's close.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";

type Quote = { price: number; at: string };

/** How long after creating a comparison its prices may still be locked in. */
const START_WINDOW_MS = 10 * 60_000;
/** A quote older than this isn't live (a halt, a holiday, the feed lagging). */
const MAX_AGE_MS = 15 * 60_000;
/** Quotes are reused this long, so typing in the editor doesn't spend Tiingo requests. */
const CACHE_MS = 60_000;
const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;

const cache = new Map<string, { q: Quote | null; t: number }>();

const nyParts = (t: number) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(t)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: p.weekday };
};

/** Sessions that close at 13:00 New York (keep in step with EARLY_CLOSES in src/lib/market.ts). */
const EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

/** 9:30–16:00 New York (13:00 on a half day), Monday to Friday. Holidays are caught by the quotes' timestamps. */
export function marketHours(t: number): boolean {
  const { date, minutes, weekday } = nyParts(t);
  const close = EARLY_CLOSES.has(date) ? 13 * 60 : 16 * 60;
  return weekday !== "Sat" && weekday !== "Sun" && minutes >= 9 * 60 + 30 && minutes < close;
}

/** A quote counts as live if it was updated today, during market hours, within the last 15 minutes. */
function liveQuote(row: Record<string, unknown>, now: number): Quote | null {
  const price = Number(row.tngoLast ?? row.last);
  // When Tiingo last updated the quote (not the last IEX trade, which can be minutes old for a busy stock).
  const at = Date.parse(String(row.timestamp ?? row.lastSaleTimestamp ?? ""));
  if (!(price > 0) || !Number.isFinite(at)) return null;
  if (now - at > MAX_AGE_MS || at - now > 60_000) return null;
  if (nyParts(at).date !== nyParts(now).date || !marketHours(at)) return null;
  // "at" is when we took the price: the moment the purchase happened.
  return { price, at: new Date(now).toISOString() };
}

async function quotes(tickers: string[], token: string, now: number, fresh = false): Promise<Record<string, Quote>> {
  const want = tickers.filter((t) => {
    const c = cache.get(t);
    return fresh || !c || now - c.t > CACHE_MS;
  });
  if (want.length) {
    const res = await fetch(`https://api.tiingo.com/iex/?tickers=${want.map((t) => t.toLowerCase()).join(",")}`, {
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Tiingo ${res.status}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    for (const t of want) {
      const row = (Array.isArray(rows) ? rows : []).find((r) => String(r.ticker ?? "").toUpperCase() === t);
      cache.set(t, { q: row ? liveQuote(row, now) : null, t: now });
    }
  }
  const out: Record<string, Quote> = {};
  for (const t of tickers) {
    const q = cache.get(t)?.q;
    if (q) out[t] = q;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  const token = Deno.env.get("TIINGO_API_KEY");
  if (!token) return json(req, { error: "server is missing TIINGO_API_KEY" }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !who?.user) return json(req, { error: "sign in first" }, 401);

  let body: { action?: unknown; tickers?: unknown; setId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "body must be JSON" }, 400);
  }
  const now = Date.now();
  const open = marketHours(now);

  try {
    if (body.action === "quote") {
      const tickers = [...new Set((Array.isArray(body.tickers) ? body.tickers : []).map((t) => String(t).toUpperCase()))]
        .filter((t) => TICKER_RE.test(t))
        .slice(0, 10);
      if (!open || !tickers.length) return json(req, { open, quotes: {} });
      return json(req, { open, quotes: await quotes(tickers, token, now) });
    }

    if (body.action === "start") {
      const setId = String(body.setId ?? "");
      const { data: set, error: se } = await admin
        .from("comparison_sets")
        .select("id, user_id, what_if, archived_at, created_at")
        .eq("id", setId)
        .maybeSingle();
      if (se) throw se;
      if (!set || set.user_id !== who.user.id) return json(req, { error: "not your comparison" }, 404);
      if (set.what_if || set.archived_at) return json(req, { open, locked: {}, reason: "not a live comparison" });
      if (now - Date.parse(set.created_at as string) > START_WINDOW_MS) {
        return json(req, { open, locked: {}, reason: "too late to lock prices" });
      }
      if (!open) return json(req, { open, locked: {}, reason: "market closed" });

      const { data: pfs, error: pe } = await admin
        .from("portfolios")
        .select("id, slot, start_quotes, transactions(kind, weights, placed_at)")
        .eq("set_id", setId);
      if (pe) throw pe;
      const todo = (pfs ?? []).filter((p) => !p.start_quotes);
      const tickersOf = (p: (typeof todo)[number]) => {
        const tx = (p.transactions as { kind: string; weights: Record<string, number> | null }[]).find(
          (t) => t.kind === "rebalance" && t.weights,
        );
        return Object.keys(tx?.weights ?? {});
      };
      const all = [...new Set(todo.flatMap(tickersOf))];
      // Always a fresh quote here: the price at the moment the comparison was made, not a cached one.
      const live = all.length ? await quotes(all, token, now, true) : {};
      const locked: Record<number, Record<string, Quote>> = {};
      for (const p of todo) {
        const mine = Object.fromEntries(tickersOf(p).filter((t) => live[t]).map((t) => [t, live[t]]));
        if (!Object.keys(mine).length) continue;
        // Only ever set once: a second call can't swap in a later price.
        const { error: ue } = await admin.from("portfolios").update({ start_quotes: mine }).eq("id", p.id).is("start_quotes", null);
        if (ue) throw ue;
        locked[p.slot as number] = mine;
      }
      return json(req, { open, locked });
    }

    return json(req, { error: "unknown action" }, 400);
  } catch (e) {
    console.log(`live-quotes: ${e instanceof Error ? e.message : e}`);
    return json(req, { open, error: "live prices aren't available right now" }, 502);
  }
});
