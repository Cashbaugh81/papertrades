import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy } from "lucide-react";
import MixEditor, { mixFromRows, rowsFromMix, type Row } from "@/components/MixEditor";
import { createSet, type Limits, type Mix, type TickerInfo } from "@/lib/api";
import UpgradeDialog, { type UpgradeReason } from "@/components/UpgradeDialog";
import PortfolioName from "@/components/PortfolioName";
import { humanDate, money } from "@/lib/ledger";
import { nyDate } from "@/lib/market";

export const DEFAULT_FUND = "VTI";

type Props = {
  info: Record<string, TickerInfo>;
  lookup: (ticker: string) => Promise<unknown>;
  suggestions: string[];
  /** Prefill when starting over or changing the date. */
  initial?: { amount: number; weekly: number; startDate?: string; mixes?: (Mix | undefined)[]; names?: (string | null)[] };
  /** Shown when there is a comparison to go back to. */
  onCancel?: () => void;
  onCreated: () => void;
  /** What this account's plan allows. */
  limits: Limits;
  /** The account just became paid: re-read the plan. */
  onUpgraded?: () => void;
};

/** Most portfolios one comparison can hold. */
export const MAX_PORTFOLIOS = 10;

export default function SetupPage({ info, lookup, suggestions, initial, onCancel, onCreated, limits, onUpgraded }: Props) {
  const [upgrade, setUpgrade] = useState<UpgradeReason | null>(null);
  const today = nyDate();
  const [step, setStep] = useState<"money" | "columns">(initial ? "columns" : "money");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "10000");
  const [weekly, setWeekly] = useState(initial ? String(initial.weekly) : "100");
  const [mode, setMode] = useState<"today" | "past">(initial?.startDate && initial.startDate < today ? "past" : "today");
  const [pastDate, setPastDate] = useState(initial?.startDate && initial.startDate < today ? initial.startDate : "");
  // Three to start with; when re-running a comparison, as many as it had (up to
  // the plan's limit). Cloning past the last one adds another.
  const [cols, setCols] = useState<Row[][]>(() =>
    Array.from({ length: Math.min(limits.maxPortfolios, Math.max(3, initial?.mixes?.length ?? 0)) }, (_, i) => i + 1).map((s, i) => {
      if (s === 1 && limits.lockFirst) return [{ ticker: DEFAULT_FUND, pct: "100" }];
      const m = initial?.mixes?.[i];
      if (m) return rowsFromMix(m);
      return s === 1 ? [{ ticker: DEFAULT_FUND, pct: "100" }] : [{ ticker: "", pct: "100" }];
    }),
  );
  const SLOTS = cols.map((_, i) => i + 1);
  // Names chosen for each portfolio ("" shows "Portfolio N"); kept when re-running a comparison.
  const [names, setNames] = useState<string[]>(() => cols.map((_, i) => initial?.names?.[i] ?? ""));
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  // The portfolio a clone just landed in: scrolled to and briefly outlined.
  const [cloned, setCloned] = useState<{ slot: number; from: number } | null>(null);
  const cards = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    if (!cloned) return;
    cards.current[cloned.slot - 1]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = setTimeout(() => setCloned((c) => (c === cloned ? null : c)), 2500);
    return () => clearTimeout(t);
  }, [cloned]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const initialNum = Number(amount) || 0;
  const weeklyNum = Number(weekly) || 0;
  const startDate = mode === "today" ? today : pastDate;
  const moneyProblem =
    initialNum < 0 || weeklyNum < 0
      ? "Amounts can't be negative."
      : initialNum === 0 && weeklyNum === 0
        ? "Enter a starting amount, a weekly amount, or both."
        : null;

  const isBlank = (rows: Row[]) => rows.every((r) => !r.ticker.trim());

  /** Copy a portfolio's mix into the first empty portfolio (or a new one), ready to adjust. */
  function clone(from: number) {
    const rows = cols[from - 1].map((r) => ({ ...r }));
    let target = cols.findIndex((r, k) => k > 0 && k !== from - 1 && isBlank(r)) + 1;
    if (!target) {
      if (cols.length >= limits.maxPortfolios) {
        if (limits.maxPortfolios < MAX_PORTFOLIOS) setUpgrade("portfolios");
        return;
      }
      target = cols.length + 1;
    }
    setCols((c) => {
      const next = [...c];
      next[target - 1] = rows;
      return next;
    });
    setNames((n) => {
      const next = [...n];
      next[target - 1] = next[target - 1] ?? "";
      return next;
    });
    setTouched((t) => new Set(t).add(target));
    setCloned({ slot: target, from });
  }
  const roomForClone = cols.some((r, k) => k > 0 && isBlank(r)) || cols.length < limits.maxPortfolios || limits.maxPortfolios < MAX_PORTFOLIOS;
  const checked = useMemo(
    () => cols.map((rows) => (isBlank(rows) ? null : mixFromRows(rows, info))),
    [cols, info, mode, startDate],
  );
  const filled = checked.filter((c) => c !== null);
  const problem =
    mode === "past" && !pastDate
      ? "Pick a start date."
      : mode === "past" && pastDate >= today
        ? "A past start date must be before today."
        : mode === "past" && pastDate < "2000-01-03"
          ? "Prices go back to January 2000."
          : filled.length === 0
            ? "Fill in at least one portfolio."
            : (filled.find((c) => c!.problem)?.problem ?? null);

  async function start() {
    setError(null);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await createSet({
        startDate,
        initial: initialNum,
        weekly: weeklyNum,
        columns: SLOTS.flatMap((slot, i) => {
          const mix = checked[i]?.mix;
          if (!mix) return [];
          const isMarket = Object.keys(mix).length === 1 && mix[DEFAULT_FUND] === 1;
          return [{ slot, weights: mix, name: isMarket ? "Whole US market" : undefined, customName: names[i] || undefined }];
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "money") {
    return (
      <div className="mx-auto max-w-md">
        <p className="micro">Step 1 of 2</p>
        <h1 className="figure mt-1 text-[30px] leading-tight tracking-tight">How much would you invest?</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Pretend money, but use real numbers. Each portfolio you compare gets this same amount, so the only
          difference between them is what you choose to buy.
        </p>
        <form
          className="mt-7 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (moneyProblem) return setError(moneyProblem);
            setError(null);
            setStep("columns");
          }}
        >
          <MoneyField
            id="amount"
            label="Starting amount"
            hint="A lump sum you have available to invest now. Can be $0."
            value={amount}
            onChange={setAmount}
          />
          <MoneyField
            id="weekly"
            label="Added each week"
            hint="Invested every week into each portfolio, on the first trading day of the week. Can be $0."
            value={weekly}
            onChange={setWeekly}
          />
          {error && <ErrorNote text={error} />}
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-paper hover:bg-accent/90">
              Next: choose what to buy
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel} className="text-[12px] text-muted underline underline-offset-2">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="micro">{initial ? "New comparison" : "Step 2 of 2"}</p>
          <h1 className="figure mt-1 text-[28px] leading-tight tracking-tight">Choose your portfolios</h1>
          <p className="mt-1 text-[13px] text-muted">
            Each gets {money(initialNum)} to start{weeklyNum > 0 ? ` plus ${money(weeklyNum)} a week` : ""}.{" "}
            <button type="button" onClick={() => setStep("money")} className="underline underline-offset-2 hover:text-ink">
              Change amounts
            </button>
          </p>
          {limits.maxPortfolios > 3 && (
            <p className="mt-1 text-[13px] text-muted">You can add more later, up to {limits.maxPortfolios} in all.</p>
          )}
        </div>
      </div>

      <section className="mt-7 rounded-sm border border-rule bg-surface px-4 py-3.5">
        <div className="micro">Portfolio start date</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="start" checked={mode === "today"} onChange={() => setMode("today")} />
            Today <span className="text-muted">({humanDate(today)})</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="start" checked={mode === "past"} onChange={() => setMode("past")} />
            A date in the past
          </label>
          {mode === "past" && (
            <input
              type="date"
              aria-label="Start date"
              value={pastDate}
              min="2000-01-03"
              max={today}
              onChange={(e) => setPastDate(e.target.value)}
              className="rounded-sm border border-rule bg-paper px-2 py-1.5 text-sm"
            />
          )}
        </div>
        <p className="mt-2 text-[12px] leading-snug text-muted">
          {mode === "today"
            ? "Your money is invested at the next market close, at a price nobody knows yet. This builds a real record of your decisions."
            : "A what-if: you'll see what would have happened, but you're choosing knowing how things turned out. It's labelled that way."}
        </p>
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {SLOTS.map((slot, i) => (
          <section
            key={slot}
            ref={(el) => {
              cards.current[i] = el;
            }}
            className={`rounded-sm border bg-surface p-4 transition-[border-color,box-shadow] duration-500 ${
              cloned?.slot === slot ? "border-accent shadow-[0_0_0_2px_rgb(31_77_61_/_0.15)]" : "border-rule"
            }`}
            data-testid={`setup-col-${slot}`}
          >
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex min-w-0 flex-1 text-[14px] font-medium">
                  <PortfolioName
                    slot={slot}
                    customName={names[i]}
                    onSave={(name) => setNames((n) => n.map((v, k) => (k === i ? name : v)))}
                    testId={`setup-col-${slot}-name`}
                  />
                </h2>
                {!isBlank(cols[i]) && roomForClone && (
                  <button
                    type="button"
                    onClick={() => clone(slot)}
                    title="Copy this mix into a new portfolio, then adjust it"
                    aria-label={`Clone portfolio ${slot}`}
                    data-testid={`setup-col-${slot}-clone`}
                    className="flex shrink-0 items-center gap-1 rounded-sm border border-rule px-2 py-1 text-[11px] text-muted hover:border-ink/30 hover:text-ink"
                  >
                    <Copy size={12} aria-hidden /> Clone
                  </button>
                )}
              </div>
              {(cloned?.slot === slot || slot === 1) && (
                <div className="micro mt-0.5">
                  {cloned?.slot === slot ? `copy of portfolio ${cloned.from}` : "the whole US market"}
                </div>
              )}
            </div>
            {/* Shown until the column is first touched, not on blankness: a ticker
                is blank while its search runs, and the hint vanishing on blur
                would move the buttons below it mid-click. */}
            {slot !== 1 && !touched.has(slot) && isBlank(cols[i]) && (
              <p className="mb-2 text-[12px] text-muted">Add a fund or stock, or a mix of several. Leave blank to skip.</p>
            )}
            <MixEditor
              locked={limits.lockFirst && slot === 1}
              maxTickers={limits.maxTickers}
              onLimit={limits.maxTickers < 8 ? () => setUpgrade("tickers") : undefined}
              idPrefix={`setup-${slot}`}
              rows={cols[i]}
              onChange={(rows) => {
                setTouched((t) => (t.has(slot) ? t : new Set(t).add(slot)));
                setCols((c) => c.map((r, k) => (k === i ? rows : r)));
              }}
              info={info}
              lookup={lookup}
              suggestions={suggestions}
              startDate={mode === "past" ? startDate : undefined}
            />
            {checked[i]?.problem && !checked[i]!.problem!.startsWith("Checking") && (
              <p className="mt-2 text-[11px] leading-snug text-loss">{checked[i]!.problem}</p>
            )}
          </section>
        ))}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-paper hover:bg-accent/90 disabled:opacity-50"
        >
          {busy ? "Starting…" : mode === "today" ? "Start from today" : `Run the what-if from ${pastDate ? humanDate(pastDate) : "that date"}`}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-[12px] text-muted underline underline-offset-2">
            Keep my current comparison
          </button>
        )}
        {initial && onCancel && (
          <span className="text-[11px] text-muted">Your current comparison is kept in your history, not deleted.</span>
        )}
      </div>
      <UpgradeDialog reason={upgrade} onClose={() => setUpgrade(null)} onUpgraded={onUpgraded} />
    </div>
  );
}

function MoneyField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block" htmlFor={id}>
      <span className="micro">{label}</span>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="num w-full rounded-sm border border-rule bg-surface py-2.5 pl-7 pr-3 text-sm"
        />
      </div>
      <span className="mt-1 block text-[12px] text-muted">{hint}</span>
    </label>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-sm border-l-2 border-loss bg-loss/5 px-3 py-2 text-xs text-loss">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      {text}
    </p>
  );
}
