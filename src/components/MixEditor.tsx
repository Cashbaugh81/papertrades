import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { pricesOn, type Mix, type StartPrice, type TickerInfo } from "@/lib/api";
import { humanDate, money } from "@/lib/ledger";
import TickerField from "@/components/TickerField";

const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;
const MAX_ROWS = 8;
/** Number boxes without the browser's up/down arrows, which take room the digits need. */
const NOSPIN = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * One line of a mix. A row is set either by percentage or by shares:
 * - `shares` undefined: the percentage was typed; shares are shown worked out from it.
 * - `shares` set: a number of shares was typed (or "" for a reopened mix that keeps
 *   cash back); `exact` is its unrounded percentage at the start-date price, and
 *   `pct` the rounded one shown. A mix with any share row may add up to less than
 *   100%: the rest stays in cash.
 */
export type Row = { ticker: string; pct: string; shares?: string; exact?: number };

export function rowsFromMix(mix?: Mix): Row[] {
  if (!mix || Object.keys(mix).length === 0) return [{ ticker: "", pct: "100" }];
  // A mix that keeps cash back was made with shares; reopen it that way so it saves as it was.
  const keepsCash = Object.values(mix).reduce((a, w) => a + w, 0) < 1 - 1e-6;
  return Object.entries(mix)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([ticker, w]) =>
      keepsCash
        ? { ticker, pct: String(Math.round(w * 10000) / 100), shares: "", exact: w * 100 }
        : { ticker, pct: String(Math.round(w * 10000) / 100) },
    );
}

/** Rows that buy by shares rather than by percentage (so the mix may keep cash). */
export const usesShares = (rows: Row[]) => rows.some((r) => r.shares !== undefined);

/** Decimal places shown for share counts; fractional shares are allowed everywhere. */
export const SHARE_DECIMALS = 4;
/** Shares to show for a dollar amount at a price: up to 4 decimals, no trailing zeros. */
export const shareText = (n: number) =>
  Number.isFinite(n) ? String(Math.round(n * 10 ** SHARE_DECIMALS) / 10 ** SHARE_DECIMALS) : "";

/**
 * The mix the rows describe, or a reason it isn't one yet. Tickers must have
 * been looked up and found. A stock that started trading after the start date
 * is fine: its share waits in cash until its first trading day (see ledger).
 */
export function mixFromRows(rows: Row[], info: Record<string, TickerInfo>, amount?: number): { mix?: Mix; problem?: string } {
  const filled = rows.filter((r) => r.ticker.trim() || r.pct.trim() || r.shares?.trim());
  const byShares = usesShares(filled);
  if (filled.length === 0) return { problem: "Add at least one investment." };
  const mix: Mix = {};
  let total = 0;
  for (const r of filled) {
    const t = r.ticker.trim().toUpperCase();
    const p = r.shares !== undefined && r.exact !== undefined ? r.exact : Number(r.pct);
    if (!TICKER_RE.test(t)) return { problem: t ? `${t} isn't a ticker.` : "Every row needs a ticker." };
    if (!(p > 0)) return { problem: r.shares !== undefined ? `Give ${t} a number of shares above zero.` : `Give ${t} a percentage above zero.` };
    if (mix[t]) return { problem: `${t} is listed twice.` };
    const i = info[t];
    if (!i) return { problem: `Checking ${t}…` };
    if (i.status === "not_found") return { problem: `There's no ticker called ${t}.` };
    if (i.status !== "ok") return { problem: `Couldn't load ${t} right now.` };
    mix[t] = p;
    total += p;
  }
  if (byShares) {
    if (total > 100.01)
      return {
        problem: amount
          ? `That's ${money(((total - 100) / 100) * amount)} more than the ${money(amount)} you start with.`
          : `The percentages add up to ${round2(total)}%, more than 100%.`,
      };
  } else if (Math.abs(total - 100) > 0.01) return { problem: `The percentages add up to ${round2(total)}%, not 100%.` };
  return { mix: Object.fromEntries(Object.entries(mix).map(([t, p]) => [t, p / 100])) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Whole-number percentages split as evenly as possible, adding to exactly 100:
 * 1 → 100; 2 → 50, 50; 3 → 34, 33, 33.
 */
export function evenSplit(n: number): string[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const extra = 100 - base * n;
  return Array.from({ length: n }, (_, i) => String(base + (i < extra ? 1 : 0)));
}

/** The same rows, with their percentages reset to an even split. */
export function spreadEvenly(rows: Row[]): Row[] {
  const pcts = evenSplit(rows.length);
  return rows.map(({ ticker }, i) => ({ ticker, pct: pcts[i] }));
}

type Props = {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  info: Record<string, TickerInfo>;
  /** Load a ticker we haven't seen yet. */
  lookup: (ticker: string) => Promise<unknown>;
  /** Tickers already loaded. (Kept for callers; search now offers matches by name.) */
  suggestions?: string[];
  idPrefix: string;
  /** Most tickers this portfolio may hold on the account's plan (default: the app's 8). */
  maxTickers?: number;
  /** Called instead of adding a row when `maxTickers` is reached (shows the upgrade message). */
  onLimit?: () => void;
  /** Show the mix but don't allow changes (a free account's portfolio 1). */
  locked?: boolean;
  /** The day the money goes in: a stock that started trading later gets a note that its share waits in cash. */
  startDate?: string;
  /** The starting amount and the day it buys at: together they turn on the Shares column. */
  amount?: number;
  priceDate?: string;
};

/** Rows of ticker + percentage. Unknown tickers are looked up as they're typed. */
export default function MixEditor({
  rows,
  onChange,
  info,
  lookup,
  idPrefix,
  maxTickers = MAX_ROWS,
  onLimit,
  locked = false,
  startDate,
  amount,
  priceDate,
}: Props) {
  const pctOf = (r: Row) => (r.shares !== undefined && r.exact !== undefined ? r.exact : Number(r.pct) || 0);
  const total = useMemo(() => rows.reduce((a, r) => a + pctOf(r), 0), [rows]);
  const byShares = usesShares(rows);
  const showShares = !!amount && amount > 0 && !!priceDate;

  // The price each ticker buys at on the start date, for the Shares column.
  const [prices, setPrices] = useState<Record<string, StartPrice>>({});
  const okTickers = rows
    .map((r) => r.ticker.trim().toUpperCase())
    .filter((t) => info[t]?.status === "ok")
    .sort()
    .join(",");
  useEffect(() => {
    if (!showShares || !okTickers) return;
    let alive = true;
    pricesOn(okTickers.split(","), priceDate!)
      .then((p) => alive && setPrices((old) => ({ ...old, ...Object.fromEntries(Object.entries(p).map(([t, v]) => [`${t}|${priceDate}`, v])) })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [showShares, okTickers, priceDate]);
  const priceOf = (t: string): StartPrice | undefined => prices[`${t}|${priceDate}`];
  const [asked, setAsked] = useState<Set<string>>(() => new Set());
  // Rows whose search is still running.
  const [searching, setSearching] = useState<Set<number>>(() => new Set());
  const setRowSearching = (i: number, on: boolean) =>
    setSearching((s) => {
      if (s.has(i) === on) return s;
      const n = new Set(s);
      if (on) n.add(i);
      else n.delete(i);
      return n;
    });

  // Look up any complete ticker we know nothing about, after a pause in typing.
  useEffect(() => {
    const wanted = rows
      .map((r) => r.ticker.trim().toUpperCase())
      .filter((t) => TICKER_RE.test(t) && !info[t] && !asked.has(t));
    if (wanted.length === 0) return;
    const timer = window.setTimeout(() => {
      setAsked((s) => new Set([...s, ...wanted]));
      for (const t of wanted) void lookup(t).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [rows, info, asked, lookup]);

  // A search can finish after other edits, so always change the latest rows.
  const latestRows = useRef(rows);
  latestRows.current = rows;
  const set = (i: number, patch: Partial<Row>) =>
    onChange(latestRows.current.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  /** A share row's percentage at the current price and amount. */
  const sharePct = (t: string, shares: string): number | undefined => {
    const px = priceOf(t)?.close;
    const n = Number(shares);
    if (!px || !amount || !(n >= 0) || shares.trim() === "") return undefined;
    return ((n * px) / amount) * 100;
  };
  const setShares = (i: number, shares: string) => {
    const t = latestRows.current[i].ticker.trim().toUpperCase();
    const exact = sharePct(t, shares);
    set(i, { shares, exact: exact ?? 0, pct: exact === undefined ? "" : String(round2(exact)) });
  };
  // Typed shares follow the price: if the start date or amount changes, so does their percentage.
  useEffect(() => {
    if (!showShares) return;
    let changed = false;
    const next = rows.map((r) => {
      if (!r.shares) return r; // percentage rows, and reopened ones not retyped
      const exact = sharePct(r.ticker.trim().toUpperCase(), r.shares);
      if (exact === undefined || (r.exact !== undefined && Math.abs(exact - r.exact) < 1e-9)) return r;
      changed = true;
      return { ...r, exact, pct: String(round2(exact)) };
    });
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, amount, priceDate, showShares]);
  /** What the Shares box shows: what was typed, else worked out from the percentage. */
  const sharesShown = (r: Row): string => {
    if (r.shares) return r.shares;
    const px = priceOf(r.ticker.trim().toUpperCase())?.close;
    const p = pctOf(r);
    return px && amount && p > 0 ? shareText(((p / 100) * amount) / px) : "";
  };
  const cashLeft = amount ? ((100 - total) / 100) * amount : 0;
  const priceNote = (t: string) => {
    const p = priceOf(t);
    if (!p) return "";
    return p.estimate ? `${money(p.close, 2)} a share (latest close)` : `${money(p.close, 2)} a share on ${humanDate(p.day)}`;
  };

  if (locked) {
    return (
      <div className="space-y-1.5" data-testid={`${idPrefix}-locked`}>
        {rows.map((r) => (
          <div key={r.ticker} className="flex items-center justify-between rounded-sm border border-rule bg-paper px-2.5 py-2 text-sm">
            <span className="font-medium">{r.ticker}</span>
            <span className="num text-muted">
              {showShares && sharesShown(r) ? `${sharesShown(r)} shares · ` : ""}
              {r.pct}%
            </span>
          </div>
        ))}
        <p className="text-[11px] leading-snug text-muted">
          Portfolio 1 is always the whole US market, so every comparison has the same yardstick.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showShares && (
        <div className="-mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted">
          <span className="flex-1">Ticker</span>
          <span className="w-[76px] shrink-0 text-right">Shares</span>
          <span className="w-[76px] shrink-0 text-right" title={`Percent of ${money(amount!)}`}>
            %
          </span>
          <span className="w-[26px] shrink-0" />
        </div>
      )}
      {rows.map((r, i) => {
        const t = r.ticker.trim().toUpperCase();
        const status = searching.has(i) ? "checking…" : !t ? "" : !TICKER_RE.test(t) ? "not a ticker" : !info[t] ? "checking…" : info[t].status === "ok" ? "" : info[t].status === "not_found" ? "not found" : "unavailable";
        return (
          <div key={i}>
            <div className="flex items-center gap-2">
              <TickerField
                key={`${i}-${rows.length}`}
                value={t}
                onCommit={(ticker) => set(i, { ticker })}
                onPending={(on) => setRowSearching(i, on)}
                label={`Ticker ${i + 1}`}
                testId={`${idPrefix}-ticker-${i}`}
              />
              {showShares && (
                <input
                  aria-label={`Shares of ticker ${i + 1}`}
                  title="Whole or partial shares, e.g. 2.5"
                  data-testid={`${idPrefix}-shares-${i}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder={t && !priceOf(t) && info[t]?.status === "ok" ? "…" : ""}
                  disabled={!priceOf(t)}
                  value={sharesShown(r)}
                  onChange={(e) => setShares(i, e.target.value)}
                  className={`num w-[76px] shrink-0 rounded-sm border bg-surface px-2 py-2 text-right text-[13px] disabled:bg-paper disabled:text-muted ${NOSPIN} ${
                    r.shares ? "border-ink/40" : "border-rule"
                  }`}
                />
              )}
              <div className={`relative ${showShares ? "w-[76px]" : "w-[84px]"} shrink-0`}>
                <input
                  aria-label={`Percentage for ticker ${i + 1}`}
                  data-testid={`${idPrefix}-pct-${i}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="any"
                  value={r.pct}
                  onChange={(e) => set(i, { pct: e.target.value, shares: undefined, exact: undefined })}
                  className={`num w-full rounded-sm border border-rule bg-surface py-2 text-right ${
                    showShares ? `pl-1.5 pr-5 text-[13px] ${NOSPIN}` : "pl-2.5 pr-6 text-sm"
                  }`}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    rows.length <= 1
                      ? [{ ticker: "", pct: "100" }]
                      : byShares // removing a row keeps the others' shares; its money goes to cash
                        ? rows.filter((_, k) => k !== i)
                        : spreadEvenly(rows.filter((_, k) => k !== i)),
                  )
                }
                className="shrink-0 rounded-sm p-1.5 text-muted transition-colors hover:text-loss"
                aria-label={`Remove ticker ${i + 1}`}
              >
                <X size={14} />
              </button>
            </div>
            {(status || info[t]?.name) && (
              <div className={`mt-0.5 truncate pl-0.5 text-[11px] ${status && status !== "checking…" ? "text-loss" : "text-muted"}`}>
                {status || info[t]?.name}
              </div>
            )}
            {!status && showShares && priceNote(t) && (
              <div className="pl-0.5 text-[11px] text-muted" data-testid={`${idPrefix}-price-${i}`}>
                {priceNote(t)}
              </div>
            )}
            {!status && startDate && info[t]?.status === "ok" && info[t]?.first_date && info[t]!.first_date! > startDate && (
              <div className="mt-0.5 pl-0.5 text-[11px] leading-snug text-flag" data-testid={`${idPrefix}-listing-${i}`}>
                Started trading {humanDate(info[t]!.first_date!)}. Its share stays in cash until then.
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1 text-xs">
        {rows.length < Math.min(MAX_ROWS, onLimit ? MAX_ROWS : maxTickers) ? (
          <button
            type="button"
            onClick={() =>
              rows.length >= maxTickers
                ? onLimit?.()
                : onChange(byShares ? [...rows, { ticker: "", pct: "", shares: "", exact: 0 }] : spreadEvenly([...rows, { ticker: "", pct: "" }]))
            }
            className="flex items-center gap-1 text-muted underline decoration-rule underline-offset-2 hover:text-ink"
          >
            <Plus size={12} /> Add another
          </button>
        ) : (
          <span />
        )}
        <span
          className={`num ${(byShares ? total > 100.01 : Math.abs(total - 100) > 0.01) ? "text-loss" : "text-muted"}`}
          data-testid={`${idPrefix}-total`}
        >
          Total {round2(total)}%
          {byShares && amount && total < 99.995 ? ` · Cash ${money(cashLeft)}` : ""}
        </span>
      </div>
      {showShares && byShares && total < 99.995 && total <= 100.01 && (
        <p className="m-0 text-[11px] leading-snug text-muted" data-testid={`${idPrefix}-cash-note`}>
          {money(cashLeft)} isn't spent on shares, so it stays in cash (as does {round2(100 - total)}% of any weekly amount).
        </p>
      )}
      {showShares && priceDate && priceDate < new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10) && (
        <p className="m-0 text-[11px] leading-snug text-muted">
          Prices are adjusted for later stock splits, so share counts are in today's shares.
        </p>
      )}
    </div>
  );
}
