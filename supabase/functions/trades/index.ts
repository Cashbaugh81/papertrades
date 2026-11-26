// POST /functions/v1/trades
//   { action: "place", portfolioId, trade: { kind: "buy"|"sell", ticker, date, amount?, fraction? } }
//   { action: "delete", txId }
//   → { ok: true, id? } or { ok: false, problem, others: [{ txId, date, reason }] }
//
// Buys and sells on a date, at that day's close (buy/sell plan, phase 2). The
// server has the final say: it replays the portfolio's whole history with the
// app's own engine (the same code the trade dialog previews with) and saves
// only if this trade works and no other trade stops working. Rules:
//   * Premium (paid or admin) accounts only; never portfolio 1 (the benchmark);
//   * a trade is stored as dollars or a share of the holding, never shares;
//   * on a date from the portfolio's start to the latest close;
//   * at most 8 tickers held at once.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildIndex,
  checkDelete,
  checkTrade,
  normaliseTicker,
  rowToPortfolio,
  seriesToBundle,
  tickersFor,
  tickersHeldAtOnce,
} from "../_shared/engine.js";
import { corsHeaders, json } from "../_shared/http.ts";

const MAX_HELD = 8;
const LOOKBACK_DAYS = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Db = SupabaseClient<any, "public", any>;

/** The portfolio (as the engine sees it), its row, its set, and the owner's plan. */
async function load(db: Db, portfolioId: string, uid: string) {
  const { data: prow, error: pe } = await db.from("portfolios").select("*").eq("id", portfolioId).maybeSingle();
  if (pe) throw pe;
  if (!prow || prow.user_id !== uid) return null;
  const { data: set, error: se } = await db
    .from("comparison_sets")
    .select("initial, weekly, archived_at")
    .eq("id", prow.set_id)
    .single();
  if (se) throw se;
  const { data: txs, error: te } = await db.from("transactions").select("*").eq("portfolio_id", portfolioId);
  if (te) throw te;
  const { data: plan } = await db.from("account_plans").select("plan").eq("user_id", uid).maybeSingle();
  return { prow, set, txs: txs ?? [], plan: (plan?.plan as string | undefined) ?? "free" };
}

/** Price index covering the portfolio's tickers (plus any extra) from just before its start. */
async function indexFor(db: Db, p: { startDate: string }, tickers: string[]) {
  const from = new Date(Date.parse(`${p.startDate}T00:00:00Z`) - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db.rpc("price_series", { p_tickers: tickers, p_from: from });
  if (error) throw error;
  return { index: buildIndex(seriesToBundle(data ?? [])), have: new Set((data ?? []).map((r: { ticker: string }) => r.ticker)) };
}

function refuse(req: Request, problem: string, others: unknown[] = []) {
  return json(req, { ok: false, problem, others });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  }) as Db;
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who, error: authError } = await db.auth.getUser(jwt);
  if (authError || !who?.user) return json(req, { error: "sign in first" }, 401);
  const uid = who.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "body must be JSON" }, 400);
  }

  try {
    if (body.action === "place") {
      const t = (body.trade ?? {}) as Record<string, unknown>;
      const kind = t.kind === "buy" || t.kind === "sell" ? t.kind : undefined;
      const ticker = typeof t.ticker === "string" ? normaliseTicker(t.ticker) : undefined;
      const date = typeof t.date === "string" && DATE_RE.test(t.date) ? t.date : undefined;
      const amount = t.amount === undefined || t.amount === null ? undefined : Math.round(Number(t.amount) * 100) / 100;
      const fraction = t.fraction === undefined || t.fraction === null ? undefined : Math.round(Number(t.fraction) * 1e10) / 1e10;
      if (!kind || !ticker || !date) return json(req, { error: "a trade needs kind, ticker and date" }, 400);
      if ((amount === undefined) === (fraction === undefined)) return json(req, { error: "give an amount or a fraction" }, 400);
      if (amount !== undefined && !(amount >= 0.01)) return refuse(req, "The amount has to be at least $0.01.");
      if (fraction !== undefined && (kind !== "sell" || !(fraction > 0 && fraction <= 1))) {
        return refuse(req, "A share of the holding is for sales, between 0% and 100%.");
      }

      const loaded = await load(db, String(body.portfolioId ?? ""), uid);
      if (!loaded) return json(req, { error: "portfolio not found" }, 404);
      const { prow, set, txs, plan } = loaded;
      if (set.archived_at) return refuse(req, "That comparison has been closed.");
      if (plan !== "paid" && plan !== "admin") return json(req, { ok: false, upgrade: true, problem: "Trading is part of Premium." });
      if (prow.slot === 1) return refuse(req, "Portfolio 1 is the benchmark the others are compared with, so it can't be traded.");

      const p = rowToPortfolio(prow, set, txs);
      const tx = {
        id: crypto.randomUUID(),
        kind,
        date,
        ticker,
        ...(amount !== undefined ? { amount } : { fraction }),
      };
      const { index, have } = await indexFor(db, p, tickersFor({ ...p, tx: [...p.tx, tx] }));
      if (!have.has(ticker)) return refuse(req, `There are no prices for ${ticker} yet. Look it up first.`);
      if (date > index.lastDate) {
        return refuse(req, `Pick a date up to the latest close (${index.lastDate}). Trading at today's price comes later.`);
      }

      const check = checkTrade(index, p, tx, index.lastDate);
      if (check.own) return refuse(req, check.own);
      if (check.others.length) {
        return refuse(req, `This would stop ${check.others.length === 1 ? "another trade" : `${check.others.length} other trades`} from working.`, check.others);
      }
      if (!check.fill) return refuse(req, "That trade wouldn't happen by the latest close.");
      if (tickersHeldAtOnce(check.state) > MAX_HELD) {
        return refuse(req, `A portfolio can hold up to ${MAX_HELD} different stocks at once.`);
      }

      const { error: ie } = await db.from("transactions").insert({
        id: tx.id,
        portfolio_id: prow.id,
        user_id: uid,
        kind,
        ticker,
        amount: amount ?? null,
        fraction: fraction ?? null,
        trade_date: date,
        placed_at: null,
        status: "filled",
      });
      if (ie) throw ie;
      return json(req, { ok: true, id: tx.id });
    }

    if (body.action === "delete") {
      const txId = String(body.txId ?? "");
      const { data: row, error: re } = await db.from("transactions").select("id, kind, portfolio_id").eq("id", txId).maybeSingle();
      if (re) throw re;
      if (!row) return json(req, { error: "trade not found" }, 404);
      if (row.kind !== "buy" && row.kind !== "sell") return refuse(req, "Only buys and sells can be deleted here.");
      const loaded = await load(db, row.portfolio_id, uid);
      if (!loaded) return json(req, { error: "trade not found" }, 404);
      if (loaded.set.archived_at) return refuse(req, "That comparison has been closed.");
      const p = rowToPortfolio(loaded.prow, loaded.set, loaded.txs);
      const { index } = await indexFor(db, p, tickersFor(p));
      const check = checkDelete(index, p, txId, index.lastDate);
      if (!check.ok) {
        return refuse(req, `Deleting it would stop ${check.others.length === 1 ? "another trade" : `${check.others.length} other trades`} from working.`, check.others);
      }
      const { error: de } = await db.from("transactions").delete().eq("id", txId);
      if (de) throw de;
      return json(req, { ok: true });
    }

    return json(req, { error: "unknown action" }, 400);
  } catch (e) {
    console.log(`trades: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    return json(req, { error: "the trade couldn't be saved; try again" }, 500);
  }
});
