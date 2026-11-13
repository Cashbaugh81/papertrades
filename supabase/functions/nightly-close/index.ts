// POST /functions/v1/nightly-close   (called by pg_cron; header x-cron-secret)
//
// 1. Refresh the closes of every ticker any portfolio uses.
// 2. For each portfolio with pending orders, run the app's own engine and
//    record the orders that have reached their close as filled or rejected.
//
// Safe to run any number of times: an order is only ever updated from
// 'pending', and the engine's decision for it never changes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildIndex,
  CALENDAR_TICKER,
  rowToPortfolio,
  seriesToBundle,
  settle,
  tickersFor,
} from "../_shared/engine.js";
import { refreshTicker } from "../_shared/refresh.ts";

/** Days of price history loaded before a portfolio's start, for close fallbacks. */
const LOOKBACK_DAYS = 10;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // The secret lives in Supabase Vault; this checks it without it ever
  // leaving Postgres.
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok, error: secretError } = await db.rpc("nightly_close_secret_ok", { p_secret: secret });
  if (secretError || ok !== true) return new Response("forbidden", { status: 403 });

  const token = Deno.env.get("TIINGO_API_KEY");
  if (!token) return new Response("server is missing TIINGO_API_KEY", { status: 500 });

  const started = Date.now();
  const report = {
    refreshed: {} as Record<string, string>,
    portfolios: 0,
    filled: 0,
    rejected: 0,
    stillPending: 0,
    errors: [] as string[],
  };

  try {
    // ---- 1. tickers in use ---------------------------------------------------
    const inUse = new Set<string>([CALENDAR_TICKER]);
    const { data: txTickers, error: e1 } = await db.from("transactions").select("ticker").not("ticker", "is", null);
    if (e1) throw e1;
    for (const r of txTickers ?? []) inUse.add(r.ticker as string);
    const { data: weightRows, error: e2 } = await db.from("portfolios").select("weights").not("weights", "is", null);
    if (e2) throw e2;
    for (const r of weightRows ?? []) for (const t of Object.keys((r.weights as object) ?? {})) inUse.add(t);

    for (const t of [...inUse].sort()) {
      try {
        const info = await refreshTicker(db, t, token);
        report.refreshed[t] = info.error ? `${info.status} (${info.error})` : `${info.status} → ${info.last_date}`;
      } catch (e) {
        report.errors.push(`refresh ${t}: ${e instanceof Error ? e.message : e}`);
      }
    }

    // ---- 2. settle pending orders -------------------------------------------
    const { data: pending, error: e3 } = await db
      .from("transactions")
      .select("id, portfolio_id")
      .eq("status", "pending");
    if (e3) throw e3;

    const byPortfolio = new Map<string, Set<string>>();
    for (const r of pending ?? []) {
      (byPortfolio.get(r.portfolio_id) ?? byPortfolio.set(r.portfolio_id, new Set()).get(r.portfolio_id)!).add(r.id);
    }

    for (const [portfolioId, ids] of byPortfolio) {
      report.portfolios++;
      try {
        const { data: prow, error: pe } = await db.from("portfolios").select("*").eq("id", portfolioId).single();
        if (pe) throw pe;
        const { data: trows, error: te } = await db.from("transactions").select("*").eq("portfolio_id", portfolioId);
        if (te) throw te;

        const p = rowToPortfolio(prow, trows ?? []);
        const from = new Date(Date.parse(`${p.startDate}T00:00:00Z`) - LOOKBACK_DAYS * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const { data: series, error: se } = await db.rpc("price_series", { p_tickers: tickersFor(p), p_from: from });
        if (se) throw se;

        const decisions = settle(buildIndex(seriesToBundle(series ?? [])), p, ids);
        const processedAt = new Date().toISOString();
        for (const d of decisions) {
          const { id, ...fields } = d;
          const { error: ue } = await db
            .from("transactions")
            .update({ ...fields, processed_at: processedAt })
            .eq("id", id)
            .eq("status", "pending"); // a user may have cancelled it meanwhile
          if (ue) throw ue;
          if (d.status === "filled") report.filled++;
          else report.rejected++;
        }
        report.stillPending += ids.size - decisions.length;
      } catch (e) {
        report.errors.push(`portfolio ${portfolioId}: ${e instanceof Error ? e.message : e}`);
      }
    }
  } catch (e) {
    report.errors.push(e instanceof Error ? e.message : String(e));
  }

  const body = { ...report, ms: Date.now() - started };
  console.log(JSON.stringify(body));
  return new Response(JSON.stringify(body), {
    status: report.errors.length ? 500 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
