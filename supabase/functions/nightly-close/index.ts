// POST /functions/v1/nightly-close   (called by pg_cron; header x-cron-secret)
//
// Runs every hour from 17:00 to 05:00 New York time, the first an hour after
// the close. Each run:
// 1. Refreshes the closes of tickers in use that don't have the latest close
//    yet, oldest first, using at most RUN_BUDGET Tiingo requests so people
//    adding stocks still have room in the free plan's 50 an hour. SPY goes
//    first: if Tiingo doesn't have its close yet (late, or a holiday), the
//    run stops there and the next hour tries again. Later runs pick up
//    whatever earlier ones didn't reach.
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
  lastCutoff,
  nyDate,
  nyHour,
  rowToPortfolio,
  seriesToBundle,
  settle,
  tickersFor,
} from "../_shared/engine.js";
import { type CallCounter, MAX_CALLS_PER_TICKER, refreshTicker } from "../_shared/refresh.ts";

/** Tiingo requests one run may use; the free plan allows 50 an hour. */
const RUN_BUDGET = 40;

/** True from 17:00 to 05:59 New York time, when the hourly runs do their work. */
function inWindow(now: number): boolean {
  const h = nyHour(now);
  return h >= 17 || h <= 5;
}

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
  const now = Date.now();
  const counter: CallCounter = { calls: 0 };
  const report = {
    closeOf: nyDate(lastCutoff(now)),
    skipped: null as string | null,
    tiingoCalls: 0,
    refreshed: {} as Record<string, string>,
    notReached: 0,
    portfolios: 0,
    filled: 0,
    rejected: 0,
    stillPending: 0,
    errors: [] as string[],
  };

  try {
    // ---- 1. tickers in use ---------------------------------------------------
    // Every ticker in an order or a mix of a comparison that's still active.
    const inUse = new Set<string>([CALENDAR_TICKER]);
    const { data: used, error: e1 } = await db
      .from("transactions")
      .select("ticker, weights, portfolios!inner(comparison_sets!inner(archived_at))")
      .is("portfolios.comparison_sets.archived_at", null);
    if (e1) throw e1;
    for (const r of used ?? []) {
      if (r.ticker) inUse.add(r.ticker as string);
      for (const t of Object.keys((r.weights as object) ?? {})) inUse.add(t);
    }

    // Oldest first, so tickers a busy evening didn't reach go first next hour.
    const { data: metaRows, error: e2 } = await db.from("tickers").select("ticker, fetched_at").in("ticker", [...inUse]);
    if (e2) throw e2;
    const fetchedAt = new Map((metaRows ?? []).map((r) => [r.ticker as string, (r.fetched_at as string | null) ?? ""]));
    const others = [...inUse]
      .filter((t) => t !== CALENDAR_TICKER)
      .sort((a, b) => (fetchedAt.get(a) ?? "").localeCompare(fetchedAt.get(b) ?? "") || a.localeCompare(b));

    if (!inWindow(now)) {
      report.skipped = "outside 17:00–05:59 New York";
    } else {
      const refresh = async (t: string) => {
        try {
          const info = await refreshTicker(db, t, token, { now, counter });
          report.refreshed[t] = info.error ? `${info.status} (${info.error})` : `${info.status} → ${info.last_date}`;
          return info;
        } catch (e) {
          report.errors.push(`refresh ${t}: ${e instanceof Error ? e.message : e}`);
          return null;
        }
      };

      const spy = await refresh(CALENDAR_TICKER);
      if (!spy || spy.status !== "ok" || (spy.last_date ?? "") < report.closeOf) {
        report.skipped = `Tiingo doesn't have the ${report.closeOf} close yet`;
      } else {
        for (const [i, t] of others.entries()) {
          if (counter.calls + MAX_CALLS_PER_TICKER > RUN_BUDGET) {
            report.notReached = others.length - i;
            break;
          }
          await refresh(t);
        }
      }
    }
    report.tiingoCalls = counter.calls;

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
        const { data: srow, error: sse } = await db
          .from("comparison_sets")
          .select("initial, weekly")
          .eq("id", prow.set_id)
          .single();
        if (sse) throw sse;
        const { data: trows, error: te } = await db.from("transactions").select("*").eq("portfolio_id", portfolioId);
        if (te) throw te;

        const p = rowToPortfolio(prow, srow, trows ?? []);
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
