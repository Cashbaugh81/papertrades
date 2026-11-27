/**
 * Everything the app reads from or writes to Supabase. Row-level security
 * and triggers on the server enforce the rules (own data only, server-stamped
 * order times, no edits to filled rows); this module just speaks to them.
 */
import { supabase } from "@/lib/supabase";
import { nyDate } from "@/lib/market";
import { rowToPortfolio, seriesToBundle, type SeriesRow } from "@/lib/rows";
import type { Account, Portfolio, PriceBundle } from "@/lib/types";

// ---- auth -------------------------------------------------------------------

export function toAccount(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Account {
  const email = user.email ?? "";
  const name = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";
  return { id: user.id, email, name: name || email.split("@")[0] };
}

/** Where confirmation and password-reset emails send people back to. */
export function appUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/**
 * Create an account through the `signup` function, the only route the
 * database accepts (this is a private site). The server checks the password
 * against its gate and confirms the account immediately; then we sign in.
 */
export async function signUp(email: string, password: string, name: string): Promise<void> {
  const { error } = await supabase.functions.invoke("signup", {
    body: { email: email.trim(), password, name: name.trim() },
  });
  if (error) {
    let message = "Sign-up failed. Try again.";
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
    }
    throw new Error(message);
  }
  await signIn(email, password);
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/** Sign out on this device only; other devices stay signed in. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" });
}

/** The server no longer accepts this device's session (e.g. it was signed out elsewhere). */
export class SessionEnded extends Error {
  constructor() {
    super("Your session has ended. Please sign in again.");
    this.name = "SessionEnded";
  }
}

function friendlyAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match an account.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first: the link is in your inbox.";
  if (/signups? not allowed|signup is disabled|not a public site/i.test(msg)) return "this is not a public site for use";
  if (/already registered/i.test(msg)) return "An account with that email already exists. Sign in instead.";
  return msg;
}

// ---- comparison sets ----------------------------------------------------------

/** A column of the active comparison: its slot (1-3) and engine portfolio. */
export type Column = {
  slot: number;
  portfolio: Portfolio;
  /** The name its owner chose; null shows "Portfolio N". */
  customName: string | null;
};

export type ActiveSet = {
  id: string;
  startDate: string;
  initial: number;
  weekly: number;
  /** Started in the past: a replay chosen with hindsight, not a record. */
  whatIf: boolean;
  createdAt: string;
  columns: Column[];
};

export type Mix = Record<string, number>;

/** The user's active comparison, or null if they haven't started one. */
export async function loadActiveSet(): Promise<ActiveSet | null> {
  const { data: set, error } = await supabase
    .from("comparison_sets")
    .select("*")
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!set) return null;

  const { data: ps, error: pe } = await supabase.from("portfolios").select("*").eq("set_id", set.id).order("slot");
  if (pe) throw pe;
  const ids = (ps ?? []).map((p) => p.id);
  const { data: ts, error: te } = ids.length
    ? await supabase.from("transactions").select("*").in("portfolio_id", ids).order("created_at")
    : { data: [], error: null };
  if (te) throw te;

  return {
    id: set.id,
    startDate: set.start_date,
    initial: Number(set.initial),
    weekly: Number(set.weekly),
    whatIf: set.what_if,
    createdAt: set.created_at,
    columns: (ps ?? []).map((p) => ({ slot: p.slot, customName: p.custom_name ?? null, portfolio: rowToPortfolio(p, set, ts ?? []) })),
  };
}

/** A limit a paid account would lift (the server's "upgrade_required: …" errors). */
export class UpgradeRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpgradeRequired";
  }
}

function rpcError(e: { message?: string } | null): Error {
  const msg = e?.message || "That didn't save. Try again.";
  if (msg.startsWith("upgrade_required:")) return new UpgradeRequired(msg.replace(/^upgrade_required:\s*/, ""));
  return new Error(msg);
}

export type Plan = "free" | "paid" | "admin";

/** What an account may do. Free accounts are limited; paid and admin aren't. */
export type Limits = {
  plan: Plan;
  /** Most portfolios in a comparison. */
  maxPortfolios: number;
  /** Most tickers in one portfolio. */
  maxTickers: number;
  /** Portfolio 1 is always VTI and can't be changed. */
  lockFirst: boolean;
};

export const APP_MAX_PORTFOLIOS = 10;
export const APP_MAX_TICKERS = 8;

export function limitsFor(plan: Plan): Limits {
  return plan === "free"
    ? { plan, maxPortfolios: 3, maxTickers: 3, lockFirst: true }
    : { plan, maxPortfolios: APP_MAX_PORTFOLIOS, maxTickers: APP_MAX_TICKERS, lockFirst: false };
}

/** Join the Premium waitlist; this also makes the account paid (free of charge for now). */
export async function joinWaitlist(reason: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_waitlist", { p_reason: reason });
  if (error) throw rpcError(error);
  return data as string;
}

/** The signed-in account's plan; no row means free. */
export async function loadPlan(): Promise<Plan> {
  const { data, error } = await supabase.from("account_plans").select("plan").maybeSingle();
  if (error) throw error;
  return (data?.plan as Plan | undefined) ?? "free";
}

export type UserSettings = { lessonsHidden: boolean; lessonIndex: number };

/** The signed-in account's UI settings; no row means defaults. */
export async function loadSettings(): Promise<UserSettings> {
  const { data, error } = await supabase.from("user_settings").select("lessons_hidden, lesson_index").maybeSingle();
  if (error) throw error;
  return { lessonsHidden: data?.lessons_hidden ?? false, lessonIndex: data?.lesson_index ?? 0 };
}

/** Save some of the signed-in account's UI settings. */
export async function saveSettings(patch: Partial<UserSettings>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  const row: { user_id: string; updated_at: string; lessons_hidden?: boolean; lesson_index?: number } = {
    user_id: uid,
    updated_at: new Date().toISOString(),
  };
  if (patch.lessonsHidden !== undefined) row.lessons_hidden = patch.lessonsHidden;
  if (patch.lessonIndex !== undefined) row.lesson_index = patch.lessonIndex;
  const { error } = await supabase.from("user_settings").upsert(row, { onConflict: "user_id" });
  if (error) throw error;
}

/**
 * Start a comparison. The server archives the current one (kept, not
 * deleted), and decides whether this is live (today) or a what-if (past).
 */
export async function createSet(input: {
  startDate: string;
  initial: number;
  weekly: number;
  columns: { slot: number; weights: Mix; name?: string; customName?: string }[];
}): Promise<string | undefined> {
  const { data, error } = await supabase.rpc("create_comparison_set", {
    p_start_date: input.startDate,
    p_initial: input.initial,
    p_weekly: input.weekly,
    p_columns: input.columns,
  });
  if (error) throw rpcError(error);
  // A live comparison started while the market is open buys at live prices:
  // the server takes them now, once. If that fails it buys at today's close.
  if (typeof data === "string" && input.startDate >= nyDate()) await lockLivePrices(data).catch(() => undefined);
  return typeof data === "string" ? data : undefined;
}

export type LiveQuote = { price: number; at: string };

/** Take live prices as the purchase prices of a live comparison just created. */
export async function lockLivePrices(setId: string): Promise<Record<number, Record<string, LiveQuote>>> {
  const { data, error } = await supabase.functions.invoke<{ locked?: Record<number, Record<string, LiveQuote>> }>(
    "live-quotes",
    { body: { action: "start", setId } },
  );
  if (error) throw error;
  return data?.locked ?? {};
}

const liveCache = new Map<string, { q: LiveQuote | null; t: number }>();

/**
 * What a share costs right now (market hours only; none for mutual funds or
 * when the market is closed). Reused for a minute.
 */
export async function liveQuotes(tickers: string[]): Promise<Record<string, LiveQuote>> {
  const now = Date.now();
  const want = [...new Set(tickers)].filter((t) => {
    const c = liveCache.get(t);
    return !c || now - c.t > 60_000;
  });
  if (want.length) {
    const { data, error } = await supabase.functions.invoke<{ quotes?: Record<string, LiveQuote> }>("live-quotes", {
      body: { action: "quote", tickers: want.slice(0, 10) },
    });
    if (error) throw error;
    for (const t of want) liveCache.set(t, { q: data?.quotes?.[t] ?? null, t: now });
  }
  const out: Record<string, LiveQuote> = {};
  for (const t of tickers) {
    const q = liveCache.get(t)?.q;
    if (q) out[t] = q;
  }
  return out;
}

/** Fill an empty column. In a live comparison its money starts today. */
export async function addColumn(setId: string, slot: number, weights: Mix, name = ""): Promise<void> {
  const { error } = await supabase.rpc("add_column", { p_set: setId, p_slot: slot, p_name: name, p_weights: weights });
  if (error) throw rpcError(error);
}

/**
 * Restart a column with a new mix, as if it had held that mix since its start
 * date. Its earlier history is replaced; the decision log keeps a note of what
 * it replaced.
 */
export async function replaceColumn(portfolioId: string, weights: Mix, name = "", note?: string): Promise<void> {
  const { error } = await supabase.rpc("replace_column", {
    p_portfolio: portfolioId,
    p_weights: weights,
    p_name: name,
    p_note: note?.trim() ?? "",
  });
  if (error) throw rpcError(error);
}

/** Cancel a pending order or mix change. */
export async function cancelTx(txId: string): Promise<boolean> {
  const { data, error } = await supabase.from("transactions").delete().eq("id", txId).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Name a portfolio; "" goes back to "Portfolio N". */
export async function renamePortfolio(portfolioId: string, name: string): Promise<void> {
  const custom = name.trim().slice(0, 40) || null;
  const { error } = await supabase.from("portfolios").update({ custom_name: custom }).eq("id", portfolioId);
  if (error) throw rpcError(error);
}

// ---- prices -----------------------------------------------------------------

export type TickerInfo = {
  status: "ok" | "not_found" | "error";
  name: string | null;
  first_date: string | null;
  last_date: string | null;
  error: string | null;
};

export type SearchHit = { ticker: string; name: string; assetType: string };

/** Tickers matching a ticker or a name ("netflix" → NFLX), best match first. */
export async function searchTickers(query: string): Promise<SearchHit[]> {
  const { data, error } = await supabase.functions.invoke<{ hits: SearchHit[] }>("search", { body: { query } });
  if (error || !data) return [];
  return data.hits ?? [];
}

export type PriceResult = { bundle: PriceBundle; info: Record<string, TickerInfo>; invalid: string[] };

const PER_CALL = 24; // the function takes 25 including SPY

/** Fetch (and, server-side, cache) daily adjusted closes for `tickers` from `from`. */
export async function fetchPrices(tickers: string[], from: string): Promise<PriceResult> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += PER_CALL) chunks.push(unique.slice(i, i + PER_CALL));
  if (chunks.length === 0) chunks.push([]);

  const series: SeriesRow[] = [];
  const info: Record<string, TickerInfo> = {};
  const invalid: string[] = [];
  for (const chunk of chunks) {
    const { data, error } = await supabase.functions.invoke<{
      tickers: Record<string, TickerInfo>;
      invalid: string[];
      series: SeriesRow[];
    }>("prices", { body: { tickers: chunk, from } });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 401) throw new SessionEnded();
      throw new Error(`Prices failed to load: ${error.message}`);
    }
    if (!data) throw new Error("Prices failed to load.");
    Object.assign(info, data.tickers);
    invalid.push(...data.invalid);
    for (const s of data.series) if (!series.some((x) => x.ticker === s.ticker)) series.push(s);
  }
  return { bundle: seriesToBundle(series, "Tiingo via Supabase"), info, invalid };
}

/** Merge new series into an existing bundle (new data wins). */
export function mergeBundles(a: PriceBundle, b: PriceBundle): PriceBundle {
  return {
    generated: a.generated > b.generated ? a.generated : b.generated,
    source: b.source || a.source,
    series: { ...a.series, ...b.series },
  };
}

/** A buy price for a start date: a close, or (`liveAt`) a live price during market hours. */
export type StartPrice = { day: string; close: number; estimate: boolean; liveAt?: string };

const startPriceCache = new Map<string, StartPrice | null>();

/**
 * The close each ticker buys at for `day`: the first close on or after it (a
 * stock not trading yet buys at its first close), or the latest close as an
 * estimate when there's none yet (a start date of today). Cached per session.
 */
export async function pricesOn(tickers: string[], day: string): Promise<Record<string, StartPrice>> {
  const want = [...new Set(tickers)].filter((t) => !startPriceCache.has(`${t}|${day}`)).slice(0, 10);
  if (want.length) {
    const { data, error } = await supabase.rpc("prices_on", { p_tickers: want, p_day: day });
    if (error) throw rpcError(error);
    const rows = (data ?? []) as { ticker: string; day: string; close: number | string; estimate: boolean }[];
    for (const t of want) {
      const r = rows.find((x) => x.ticker === t);
      startPriceCache.set(`${t}|${day}`, r ? { day: r.day, close: Number(r.close), estimate: r.estimate } : null);
    }
  }
  const out: Record<string, StartPrice> = {};
  for (const t of tickers) {
    const v = startPriceCache.get(`${t}|${day}`);
    if (v) out[t] = v;
  }
  return out;
}

/** A trade as the server stores it: dollars or a share of the holding (never shares). */
/** A trade on a date (at that day's close), or `now` (live price in market hours, else the next close). */
export type TradeRequest = { kind: "buy" | "sell"; ticker: string; date?: string; now?: true; amount?: number; fraction?: number };
export type TradeResult = {
  ok: boolean;
  id?: string;
  /** For a "now" trade placed in market hours: the live price it fills at. */
  live?: LiveQuote;
  problem?: string;
  upgrade?: boolean;
  others?: { txId: string; date: string; reason: string }[];
  /** For a copy: how many trades came across, and those left out (with why). */
  copied?: number;
  skipped?: { date: string; what: string; reason: string }[];
};

async function tradesCall(body: Record<string, unknown>): Promise<TradeResult> {
  const { data, error } = await supabase.functions.invoke<TradeResult & { error?: string }>("trades", { body });
  if (error) {
    // A 4xx carries a JSON body with the reason.
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? ((await ctx.json().catch(() => ({}))) as { error?: string }).error : undefined;
    return { ok: false, problem: msg ?? "That trade couldn't be saved. Try again." };
  }
  return data ?? { ok: false, problem: "No answer from the server." };
}

/** Buy or sell on a date (checked against the whole history on the server). */
export function placeTrade(portfolioId: string, trade: TradeRequest): Promise<TradeResult> {
  return tradesCall({ action: "place", portfolioId, trade });
}

/** Delete a trade (refused if a later trade relies on it). */
export function deleteTrade(txId: string): Promise<TradeResult> {
  return tradesCall({ action: "delete", txId });
}

/**
 * Copy one portfolio's trades into the portfolio in `toSlot` of `toSetId` (a
 * clone, or a comparison restarted on another date). Each is replayed there
 * and kept only if it still works; the rest come back in `skipped`.
 */
export function copyTrades(fromPortfolioId: string, toSetId: string, toSlot: number): Promise<TradeResult> {
  return tradesCall({ action: "copy", fromPortfolioId, toSetId, toSlot });
}

/** "2 trades weren't copied: The Nov 3, 2026 sale of NVDA (It's before this portfolio starts.) …" or null. */
export function skippedNote(r: TradeResult, where: string): string | null {
  if (!r.ok) return r.upgrade ? null : `${where}: its trades couldn't be copied (${r.problem ?? "try again"}).`;
  const s = r.skipped ?? [];
  if (!s.length) return null;
  const list = s.map((x) => (x.reason.startsWith(x.what) ? x.reason : `${x.what}: ${x.reason}`).replace(/\.$/, "")).join("; ");
  return `${where}: ${s.length === 1 ? "1 trade wasn't" : `${s.length} trades weren't`} copied. ${list}.`;
}
