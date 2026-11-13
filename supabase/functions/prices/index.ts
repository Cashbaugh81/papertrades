// POST /functions/v1/prices  { tickers: string[], from?: "YYYY-MM-DD" }
//
// For a signed-in user: make sure each ticker (plus the SPY calendar anchor)
// is cached, fetching from Tiingo only if it's missing or stale, then return
// the series. The Tiingo key never leaves the server.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CALENDAR_TICKER, normaliseTicker } from "../_shared/engine.js";
import { corsHeaders, json } from "../_shared/http.ts";
import { refreshTicker, type TickerInfo } from "../_shared/refresh.ts";

const MAX_TICKERS = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = Deno.env.get("TIINGO_API_KEY");
  if (!token) return json(req, { error: "server is missing TIINGO_API_KEY" }, 500);

  // A real signed-in user, not just the public key: the Tiingo free tier is
  // for personal use, so anonymous callers can't spend it.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: who, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !who?.user) return json(req, { error: "sign in first" }, 401);

  let body: { tickers?: unknown; from?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "body must be JSON" }, 400);
  }
  if (!Array.isArray(body.tickers)) return json(req, { error: "tickers must be an array" }, 400);

  const invalid: string[] = [];
  const wanted = new Set<string>([CALENDAR_TICKER]);
  for (const raw of body.tickers) {
    const t = typeof raw === "string" ? normaliseTicker(raw) : undefined;
    if (t) wanted.add(t);
    else invalid.push(String(raw).slice(0, 20));
  }
  if (wanted.size > MAX_TICKERS) return json(req, { error: `at most ${MAX_TICKERS} tickers per request` }, 400);
  const from =
    typeof body.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : "1900-01-01";

  // One at a time: the free tier allows ~50 requests an hour, and most
  // tickers are already cached, so this is rarely more than one fetch.
  const info: Record<string, TickerInfo> = {};
  for (const t of wanted) info[t] = await refreshTicker(admin, t, token);

  const ok = [...wanted].filter((t) => info[t].status === "ok");
  const { data: series, error } = await admin.rpc("price_series", { p_tickers: ok, p_from: from });
  if (error) return json(req, { error: error.message }, 500);

  return json(req, {
    tickers: Object.fromEntries(
      Object.entries(info).map(([t, i]) => [
        t,
        { status: i.status, name: i.name, first_date: i.first_date, last_date: i.last_date, error: i.error },
      ]),
    ),
    invalid,
    series,
  });
});
