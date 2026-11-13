/**
 * Everything the app reads from or writes to Supabase. Row-level security
 * and triggers on the server enforce the rules (own data only, server-stamped
 * order times, no edits to filled rows); this module just speaks to them.
 */
import { supabase } from "@/lib/supabase";
import { nyDate } from "@/lib/market";
import { rowToPortfolio, seriesToBundle, type SeriesRow } from "@/lib/rows";
import { exampleStart, STARTERS } from "@/lib/starters";
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

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

function friendlyAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match an account.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first: the link is in your inbox.";
  if (/signups? not allowed|signup is disabled|not a public site/i.test(msg)) return "this is not a public site for use";
  if (/already registered/i.test(msg)) return "An account with that email already exists. Sign in instead.";
  return msg;
}

// ---- portfolios and transactions -------------------------------------------

export async function loadPortfolios(): Promise<Portfolio[]> {
  const [{ data: ps, error: pe }, { data: ts, error: te }] = await Promise.all([
    supabase.from("portfolios").select("*").order("created_at"),
    supabase.from("transactions").select("*").order("created_at"),
  ]);
  if (pe) throw pe;
  if (te) throw te;
  return (ps ?? []).map((p) => rowToPortfolio(p, ts ?? []));
}

/**
 * Seed the example portfolios once per account. A flag in the user's metadata
 * stops them coming back after "Start fresh today" or on a second device.
 */
export async function seedExamplesOnce(existing: Portfolio[]): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  if (data.user?.user_metadata?.seeded || existing.length > 0) return false;
  await insertStarters(true);
  await supabase.auth.updateUser({ data: { seeded: true } });
  return true;
}

/** Replace the examples with the same three as real portfolios starting today. */
export async function startFresh(): Promise<void> {
  const { error } = await supabase.from("portfolios").delete().eq("example", true);
  if (error) throw error;
  await insertStarters(false);
}

async function insertStarters(example: boolean): Promise<void> {
  const today = nyDate();
  const start = example ? exampleStart(today) : today; // the server forces today for real ones
  const rows = STARTERS.map((s) => ({
    id: crypto.randomUUID(),
    name: s.name,
    thesis: s.thesis,
    start_date: start,
    initial: s.initial,
    monthly: s.monthly,
    weights: s.weights,
    example,
  }));
  const { error: pe } = await supabase.from("portfolios").insert(rows);
  if (pe) throw pe;
  const txs = STARTERS.flatMap((s, i) =>
    s.buys.map((b) => ({
      portfolio_id: rows[i].id,
      kind: "buy",
      ticker: b.ticker,
      amount: b.amount,
      trade_date: start, // examples fill at this day's close; real orders get server time
    })),
  );
  const { error: te } = await supabase.from("transactions").insert(txs);
  if (te) throw te;
}

export type OrderInput = { kind: "buy" | "sell" | "deposit"; ticker?: string; amount: number; note?: string };

/** Place an order or deposit. The server stamps the time; nothing else is trusted. */
export async function placeOrder(portfolioId: string, o: OrderInput): Promise<void> {
  const { error } = await supabase.from("transactions").insert({
    portfolio_id: portfolioId,
    kind: o.kind,
    ticker: o.kind === "deposit" ? null : (o.ticker ?? null),
    amount: o.amount,
    note: o.note || null,
    trade_date: nyDate(), // replaced by the server for real portfolios
  });
  if (error) throw error;
}

/** Cancel a pending order (or remove a row from an example portfolio). */
export async function cancelTx(txId: string): Promise<boolean> {
  const { data, error } = await supabase.from("transactions").delete().eq("id", txId).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

// ---- prices -----------------------------------------------------------------

export type TickerInfo = {
  status: "ok" | "not_found" | "error";
  name: string | null;
  first_date: string | null;
  last_date: string | null;
  error: string | null;
};

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
    if (error) throw new Error(`Prices failed to load: ${error.message}`);
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
