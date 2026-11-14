// POST /functions/v1/search  { query: string }  →  { hits: [{ ticker, name, assetType }], source }
//
// For a signed-in user: find tickers by ticker or name ("netflix" → NFLX).
// Tiingo's search endpoint answers; each query is cached for 30 days, since
// every Tiingo request counts against the free plan's 50 an hour. When Tiingo
// can't answer (limit reached, outage), names seen before are searched instead.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { MAX_HITS, normaliseQuery, parseSearch, rank } from "../_shared/search.js";

type SearchHit = { ticker: string; name: string; assetType: string };

const CACHE_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = Deno.env.get("TIINGO_API_KEY");
  if (!token) return json(req, { error: "server is missing TIINGO_API_KEY" }, 500);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: who, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !who?.user) return json(req, { error: "sign in first" }, 401);

  let body: { query?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "body must be JSON" }, 400);
  }
  const q = typeof body.query === "string" ? normaliseQuery(body.query) : undefined;
  if (!q) return json(req, { hits: [], source: "none" });

  // 1. Cached?
  const { data: cached } = await admin.from("symbol_search_cache").select("results, fetched_at").eq("query", q).maybeSingle();
  if (cached && Date.now() - Date.parse(cached.fetched_at as string) < CACHE_DAYS * 86_400_000) {
    return json(req, { hits: cached.results, source: "cache" });
  }

  // 2. Ask Tiingo.
  try {
    const res = await fetch(`https://api.tiingo.com/tiingo/utilities/search?query=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Tiingo ${res.status}`);
    const hits: SearchHit[] = parseSearch(await res.json(), q);
    await admin.from("symbol_search_cache").upsert({ query: q, results: hits, fetched_at: new Date().toISOString() });
    if (hits.length) {
      await admin.from("symbols").upsert(
        hits.map((h) => ({ ticker: h.ticker, name: h.name, asset_type: h.assetType, updated_at: new Date().toISOString() })),
      );
    }
    return json(req, { hits, source: "tiingo" });
  } catch (e) {
    console.log(`search "${q}": ${e instanceof Error ? e.message : e}; using saved names`);
  }

  // 3. Fall back to names we've seen (search results and priced tickers).
  // The query only holds letters, digits, spaces and . & ' - (normaliseQuery),
  // so it's safe inside a quoted filter value.
  const like = `%${q.replace(/[%_\\]/g, "")}%`;
  const prefix = `${q.replace(/[%_\\]/g, "")}%`;
  const [sym, tick] = await Promise.all([
    admin.from("symbols").select("ticker, name, asset_type").or(`ticker.ilike."${prefix}",name.ilike."${like}"`).limit(MAX_HITS * 2),
    admin.from("tickers").select("ticker, name").eq("status", "ok").or(`ticker.ilike."${prefix}",name.ilike."${like}"`).limit(MAX_HITS * 2),
  ]);
  const byTicker = new Map<string, SearchHit>();
  for (const r of sym.data ?? []) byTicker.set(r.ticker, { ticker: r.ticker, name: r.name, assetType: r.asset_type });
  for (const r of tick.data ?? []) if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, { ticker: r.ticker, name: r.name ?? r.ticker, assetType: "" });
  return json(req, { hits: rank([...byTicker.values()], q).slice(0, MAX_HITS), source: "saved" });
});
