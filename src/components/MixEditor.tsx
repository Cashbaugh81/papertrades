import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Mix, TickerInfo } from "@/lib/api";
import { humanDate } from "@/lib/ledger";
import TickerField from "@/components/TickerField";

const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;
const MAX_ROWS = 8;

export type Row = { ticker: string; pct: string };

export function rowsFromMix(mix?: Mix): Row[] {
  if (!mix || Object.keys(mix).length === 0) return [{ ticker: "", pct: "100" }];
  return Object.entries(mix)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([ticker, w]) => ({ ticker, pct: String(Math.round(w * 10000) / 100) }));
}

/**
 * The mix the rows describe, or a reason it isn't one yet. Tickers must have
 * been looked up and found; when `startDate` is given (a past start), each
 * must have prices from that date.
 */
export function mixFromRows(
  rows: Row[],
  info: Record<string, TickerInfo>,
  startDate?: string,
): { mix?: Mix; problem?: string } {
  const filled = rows.filter((r) => r.ticker.trim() || r.pct.trim());
  if (filled.length === 0) return { problem: "Add at least one investment." };
  const mix: Mix = {};
  let total = 0;
  for (const r of filled) {
    const t = r.ticker.trim().toUpperCase();
    const p = Number(r.pct);
    if (!TICKER_RE.test(t)) return { problem: t ? `${t} isn't a ticker.` : "Every row needs a ticker." };
    if (!(p > 0)) return { problem: `Give ${t} a percentage above zero.` };
    if (mix[t]) return { problem: `${t} is listed twice.` };
    const i = info[t];
    if (!i) return { problem: `Checking ${t}…` };
    if (i.status === "not_found") return { problem: `There's no ticker called ${t}.` };
    if (i.status !== "ok") return { problem: `Couldn't load ${t} right now.` };
    if (startDate && i.first_date && i.first_date > startDate) {
      return { problem: `${t} only has prices from ${humanDate(i.first_date)}. Pick a later start date or another fund.` };
    }
    mix[t] = p;
    total += p;
  }
  if (Math.abs(total - 100) > 0.01) return { problem: `The percentages add up to ${round2(total)}%, not 100%.` };
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
  return rows.map((r, i) => ({ ...r, pct: pcts[i] }));
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
};

/** Rows of ticker + percentage. Unknown tickers are looked up as they're typed. */
export default function MixEditor({ rows, onChange, info, lookup, idPrefix, maxTickers = MAX_ROWS, onLimit, locked = false }: Props) {
  const total = useMemo(() => rows.reduce((a, r) => a + (Number(r.pct) || 0), 0), [rows]);
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

  if (locked) {
    return (
      <div className="space-y-1.5" data-testid={`${idPrefix}-locked`}>
        {rows.map((r) => (
          <div key={r.ticker} className="flex items-center justify-between rounded-sm border border-rule bg-paper px-2.5 py-2 text-sm">
            <span className="font-medium">{r.ticker}</span>
            <span className="num text-muted">{r.pct}%</span>
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
              <div className="relative w-[84px] shrink-0">
                <input
                  aria-label={`Percentage for ticker ${i + 1}`}
                  data-testid={`${idPrefix}-pct-${i}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="any"
                  value={r.pct}
                  onChange={(e) => set(i, { pct: e.target.value })}
                  className="num w-full rounded-sm border border-rule bg-surface py-2 pl-2.5 pr-6 text-right text-sm"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
              </div>
              <button
                type="button"
                onClick={() => onChange(rows.length > 1 ? spreadEvenly(rows.filter((_, k) => k !== i)) : [{ ticker: "", pct: "100" }])}
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
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1 text-xs">
        {rows.length < Math.min(MAX_ROWS, onLimit ? MAX_ROWS : maxTickers) ? (
          <button
            type="button"
            onClick={() =>
              rows.length >= maxTickers ? onLimit?.() : onChange(spreadEvenly([...rows, { ticker: "", pct: "" }]))
            }
            className="flex items-center gap-1 text-muted underline decoration-rule underline-offset-2 hover:text-ink"
          >
            <Plus size={12} /> Add another
          </button>
        ) : (
          <span />
        )}
        <span className={`num ${Math.abs(total - 100) > 0.01 ? "text-loss" : "text-muted"}`}>
          Total {round2(total)}%
        </span>
      </div>
    </div>
  );
}
