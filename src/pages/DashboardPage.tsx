import { useMemo, useState } from "react";
import { History, Info } from "lucide-react";
import MixEditor, { mixFromRows, rowsFromMix, type Row } from "@/components/MixEditor";
import PathChart, { SERIES_COLORS } from "@/components/PathChart";
import { ErrorNote } from "@/pages/SetupPage";
import type { ActiveSet, Column, Mix, TickerInfo } from "@/lib/api";
import { humanDate, money, pct, signedPct } from "@/lib/ledger";
import type { PortfolioState, Tx } from "@/lib/types";

type Props = {
  set: ActiveSet;
  states: Map<string, PortfolioState>;
  info: Record<string, TickerInfo>;
  lookup: (ticker: string) => Promise<unknown>;
  suggestions: string[];
  pricesThrough: string;
  onChangeMix: (portfolioId: string, mix: Mix, note: string) => Promise<void>;
  onAddColumn: (slot: number, mix: Mix) => Promise<void>;
  onCancelTx: (txId: string) => void;
  onChangeDate: () => void;
  onStartOver: () => void;
};

export function mixLabel(mix?: Mix): string {
  if (!mix) return "—";
  return Object.entries(mix)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([t, w]) => `${t} ${Math.round(w * 1000) / 10}%`)
    .join(" · ");
}

export default function DashboardPage(props: Props) {
  const { set, states, pricesThrough, onChangeDate, onStartOver } = props;
  const bySlot = new Map(set.columns.map((c) => [c.slot, c]));
  const baseline = bySlot.get(1) ? states.get(bySlot.get(1)!.portfolio.id) : undefined;
  const chartStates = set.columns.map((c) => states.get(c.portfolio.id)!).filter(Boolean);
  // Colour follows the slot, so portfolio 3 stays gold even if 2 is empty.
  const colors = useMemo(
    () => Object.fromEntries(set.columns.map((c) => [c.portfolio.id, SERIES_COLORS[c.slot - 1]])),
    [set.columns],
  );
  // The chart names portfolios by number (a mix's tickers don't fit); hovering shows what's in each.
  const chartLabels = useMemo(
    () => Object.fromEntries(set.columns.map((c) => [c.portfolio.id, `Portfolio ${c.slot}`])),
    [set.columns],
  );
  const chartMixes = useMemo(
    () =>
      Object.fromEntries(
        set.columns.map((c) => {
          const st = states.get(c.portfolio.id);
          const first = c.portfolio.tx.find((t) => t.kind === "rebalance");
          return [c.portfolio.id, st?.currentWeights ?? first?.weights];
        }),
      ),
    [set.columns, states],
  );

  return (
    <div className="space-y-8">
      {/* ---- the start date bar -------------------------------------------- */}
      <section className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
        <div>
          <div className="micro">Portfolio start date</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="figure text-[26px] tracking-tight">{humanDate(set.startDate)}</span>
            {set.whatIf ? (
              <span className="rounded-sm bg-flag/10 px-2 py-0.5 text-[11px] font-medium text-flag" data-testid="badge-whatif">
                What-if: chosen with hindsight
              </span>
            ) : (
              <span className="rounded-sm bg-gain/10 px-2 py-0.5 text-[11px] font-medium text-gain" data-testid="badge-live">
                Live record
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-muted">
            Each portfolio: {money(set.initial)} to start
            {set.weekly > 0 ? ` + ${money(set.weekly)} every week` : ""}. Prices through {humanDate(pricesThrough)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[12px]">
          <button onClick={onChangeDate} className="rounded-sm border border-rule px-3 py-1.5 text-muted hover:border-ink/30 hover:text-ink">
            Change start date
          </button>
          <button onClick={onStartOver} className="rounded-sm border border-rule px-3 py-1.5 text-muted hover:border-ink/30 hover:text-ink">
            Start over
          </button>
        </div>
      </section>

      {set.whatIf && (
        <p className="flex items-start gap-2 rounded-sm border-l-2 border-flag bg-flag/5 px-3 py-2 text-[12px] leading-snug text-flag">
          <Info size={13} className="mt-0.5 shrink-0" />
          This replays history from {humanDate(set.startDate)}. It shows what would have happened, but the choices were
          made knowing how things turned out, so it isn't a record of your judgement. Start from today for that.
        </p>
      )}

      {/* ---- the three columns ---------------------------------------------- */}
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((slot) => {
          const col = bySlot.get(slot);
          return col ? (
            <ColumnCard key={slot} {...props} column={col} state={states.get(col.portfolio.id)!} baseline={slot === 1 ? undefined : baseline} />
          ) : (
            <EmptyColumn key={slot} {...props} slot={slot} />
          );
        })}
      </div>

      {/* ---- the paths -------------------------------------------------------- */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium">The paths</h2>
          <span className="micro">value of each portfolio over time</span>
        </div>
        <div className="rounded-sm border border-rule bg-surface p-4">
          <PathChart
            states={chartStates}
            baselineId={baseline?.id}
            colors={colors}
            labels={chartLabels}
            mixes={chartMixes}
          />
        </div>
      </section>

      <DecisionLog set={set} states={states} onCancelTx={props.onCancelTx} />
    </div>
  );
}

// ---- one column ---------------------------------------------------------------

function ColumnCard({
  column,
  state,
  baseline,
  set,
  info,
  lookup,
  suggestions,
  onChangeMix,
  onCancelTx,
}: Props & { column: Column; state: PortfolioState; baseline?: PortfolioState }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const p = column.portfolio;
  const firstMix = p.tx.find((t) => t.kind === "rebalance");
  const waitingToStart = !!firstMix && state.pending.some((o) => o.txId === firstMix.id);
  const pendingChange = state.pending.find((o) => o.kind === "rebalance" && o.txId !== firstMix?.id);
  const mix = state.currentWeights ?? firstMix?.weights;
  const startedLater = p.startDate !== set.startDate;
  const spread = baseline && !waitingToStart ? state.returnOnInvested - baseline.returnOnInvested : undefined;

  async function save() {
    const r = mixFromRows(rows, info, p.startDate); // the new mix replays from the start date
    if (!r.mix) return setError(r.problem ?? "Check the mix.");
    setBusy(true);
    setError(null);
    try {
      await onChangeMix(p.id, r.mix, note);
      setEditing(false);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col rounded-sm border border-rule bg-surface p-4" data-testid={`col-${column.slot}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-medium" title={p.name}>
          <span
            aria-hidden
            className="inline-block h-[3px] w-4 shrink-0 rounded-full"
            style={{ background: SERIES_COLORS[column.slot - 1] }}
          />
          <span className="truncate">{p.name}</span>
        </h2>
        <span className="micro shrink-0">{column.slot === 1 ? "baseline" : `portfolio ${column.slot}`}</span>
      </div>
      <div
        className={`mt-0.5 text-[11px] text-muted ${p.name === mixLabel(mix) ? "sr-only" : ""}`}
        data-testid={`col-${column.slot}-mix`}
      >
        {mixLabel(mix)}
      </div>

      <div className="mt-4">
        <div className="micro">Worth now</div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="figure text-[28px] leading-none tracking-tight" data-testid={`col-${column.slot}-value`}>
            {money(state.value)}
          </span>
          <span
            className={`text-[13px] [font-variant-numeric:tabular-nums] ${state.profit >= 0 ? "text-gain" : "text-loss"}`}
            data-testid={`col-${column.slot}-gain`}
          >
            {state.profit >= 0 ? "+" : "−"}
            {money(Math.abs(state.profit))} ({signedPct(state.returnOnInvested)})
          </span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-rule pt-3 text-[12px]">
        <Stat label="Cash invested" value={money(state.invested)} />
        <Stat
          label="Biggest drop"
          value={waitingToStart ? "—" : pct(state.maxDrawdown)}
          tone={state.maxDrawdown < -0.0005 ? "loss" : undefined}
          hintAlign="right"
          hint="The worst fall from a high point along the way: the number that decides whether you'd really have held on. Weekly deposits are left out, so they never hide a fall."
        />
        <Stat label="Risk %" value={waitingToStart ? "—" : pct(state.volatility)} hint="How much the value typically swings in a year (its volatility). The higher it is, the bumpier the ride." />
        {baseline ? (
          <Stat
            label="vs portfolio 1"
            value={spread === undefined ? "—" : signedPct(spread)}
            tone={spread === undefined ? undefined : spread >= 0 ? "gain" : "loss"}
          />
        ) : (
          <Stat label="Started" value={humanDate(p.startDate)} />
        )}
      </dl>

      {waitingToStart && (
        <p className="mt-3 rounded-sm bg-paper px-2.5 py-2 text-[12px] leading-snug text-muted">
          Waiting for the next market close. The money is invested at that day's closing prices.
        </p>
      )}
      {startedLater && !set.whatIf && (
        <p className="mt-3 text-[11px] text-muted">Added {humanDate(p.startDate)}, later than the others, so its numbers cover a shorter time.</p>
      )}
      {pendingChange && (
        <div className="mt-3 rounded-sm border border-flag/30 bg-flag/5 px-2.5 py-2 text-[12px] leading-snug text-flag">
          Moving to {mixLabel(pendingChange.weights)} at the next close.{" "}
          <button onClick={() => onCancelTx(pendingChange.txId)} className="underline underline-offset-2">
            Cancel
          </button>
        </div>
      )}

      <div className="mt-auto pt-4">
        {editing ? (
          <div className="space-y-2 border-t border-rule pt-3">
            <div className="micro">New mix</div>
            <MixEditor idPrefix={`edit-${column.slot}`} rows={rows} onChange={setRows} info={info} lookup={lookup} suggestions={suggestions} />
            <input
              value={note}
              maxLength={280}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why? (optional, worth writing)"
              className="w-full rounded-sm border border-rule bg-surface px-2.5 py-2 text-sm placeholder:text-muted/70"
            />
            <p className="text-[11px] leading-snug text-muted">
              This portfolio restarts as if it had held the new mix since {humanDate(p.startDate)}, with the same
              money going in. The old mix is noted in the decision log.
            </p>
            {error && <ErrorNote text={error} />}
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="rounded-sm bg-accent px-3 py-1.5 text-[12px] font-medium text-paper disabled:opacity-50">
                {busy ? "Saving…" : "Replace mix"}
              </button>
              <button onClick={() => setEditing(false)} className="px-2 text-[12px] text-muted underline underline-offset-2">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setRows(rowsFromMix(pendingChange?.weights ?? mix));
              setError(null);
              setEditing(true);
            }}
            disabled={!!pendingChange}
            className="w-full rounded-sm border border-rule px-3 py-1.5 text-[12px] text-muted hover:border-ink/30 hover:text-ink disabled:opacity-40"
          >
            Change mix
          </button>
        )}
      </div>
    </section>
  );
}

function EmptyColumn({ slot, set, info, lookup, suggestions, onAddColumn }: Props & { slot: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ ticker: "", pct: "100" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const r = mixFromRows(rows, info, set.whatIf ? set.startDate : undefined);
    if (!r.mix) return setError(r.problem ?? "Check the mix.");
    setBusy(true);
    setError(null);
    try {
      await onAddColumn(slot, r.mix);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col rounded-sm border border-dashed border-rule p-4" data-testid={`col-${slot}-empty`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[14px] font-medium text-muted">Portfolio {slot}</h2>
        <span className="micro">empty</span>
      </div>
      {open ? (
        <div className="mt-3 space-y-2">
          <MixEditor idPrefix={`add-${slot}`} rows={rows} onChange={setRows} info={info} lookup={lookup} suggestions={suggestions} />
          <p className="text-[11px] leading-snug text-muted">
            {set.whatIf
              ? `Replays from ${humanDate(set.startDate)} like the others.`
              : "Its money is invested at the next close, so it starts later than the others."}
          </p>
          {error && <ErrorNote text={error} />}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="rounded-sm bg-accent px-3 py-1.5 text-[12px] font-medium text-paper disabled:opacity-50">
              {busy ? "Adding…" : "Add portfolio"}
            </button>
            <button onClick={() => setOpen(false)} className="px-2 text-[12px] text-muted underline underline-offset-2">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-6 flex-1 rounded-sm border border-rule py-6 text-[13px] text-muted hover:border-ink/30 hover:text-ink"
        >
          + Choose what to compare
        </button>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
  hintAlign = "left",
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss";
  hint?: string;
  /** Which edge the callout lines up with; "right" for labels in the right-hand column. */
  hintAlign?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <dt className="text-muted">
        {hint ? (
          // Explained in a callout on hover, focus or tap.
          <span className="relative inline-block">
            <button
              type="button"
              className="cursor-help underline decoration-dotted decoration-[#b9b0a1] underline-offset-[3px] hover:text-ink"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onClick={() => setOpen(true)} // a tap also fires hover, so only open; tapping elsewhere closes it
              aria-expanded={open}
              aria-describedby={open ? `hint-${label}` : undefined}
            >
              {label}
            </button>
            {open && (
              <span
                id={`hint-${label}`}
                role="tooltip"
                className={`absolute bottom-full ${hintAlign === "right" ? "right-0" : "left-0"} z-20 mb-1.5 block w-56 max-w-[calc(100vw-3rem)] rounded-sm border border-rule bg-surface p-2.5 text-[12px] leading-snug text-ink shadow-sm`}
              >
                {hint}
              </span>
            )}
          </span>
        ) : (
          label
        )}
      </dt>
      <dd className={`num ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

// ---- decisions ----------------------------------------------------------------

function DecisionLog({ set, states, onCancelTx }: { set: ActiveSet; states: Map<string, PortfolioState>; onCancelTx: (id: string) => void }) {
  const rows = useMemo(() => {
    const out: { tx: Tx; column: Column; first: boolean; state: PortfolioState }[] = [];
    for (const c of set.columns) {
      const s = states.get(c.portfolio.id)!;
      const mixes = c.portfolio.tx.filter((t) => t.kind === "rebalance");
      mixes.forEach((tx, i) => out.push({ tx, column: c, first: i === 0, state: s }));
    }
    return out.sort((a, b) => ((b.tx.placedAt ?? b.tx.date) < (a.tx.placedAt ?? a.tx.date) ? -1 : 1));
  }, [set, states]);

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-medium">
          <History size={15} /> Decisions
        </h2>
        <span className="micro">newest first</span>
      </div>
      <ul className="divide-y divide-rule/70 rounded-sm border border-rule bg-surface text-[13px]">
        {rows.map(({ tx, column, first, state }) => {
          const fill = state.fills[tx.id];
          const pending = state.pending.some((o) => o.txId === tx.id);
          return (
            <li key={tx.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3.5 py-2.5">
              <div className="min-w-0">
                <span className="text-muted">{humanDate(tx.date)} · </span>
                <span className="font-medium">{column.portfolio.name}</span>
                <span className="text-muted"> {first ? "started with" : "changed to"} </span>
                <span>{mixLabel(tx.weights)}</span>
                {tx.note && <div className="mt-0.5 text-[12px] text-muted">“{tx.note}”</div>}
              </div>
              <div className="shrink-0 text-[12px] text-muted">
                {pending ? (
                  <>
                    <span className="uppercase tracking-wide">pending</span>
                    {!first && (
                      <button onClick={() => onCancelTx(tx.id)} className="ml-2 underline underline-offset-2 hover:text-loss">
                        cancel
                      </button>
                    )}
                  </>
                ) : fill ? (
                  `invested ${money(fill.amount)} at the ${humanDate(fill.date)} close`
                ) : (
                  "—"
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
