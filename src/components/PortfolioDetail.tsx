import { useMemo, useRef, useState } from "react";
import { SHARE_DECIMALS } from "@/components/MixEditor";
import Stat from "@/components/Stat";
import { humanDate, mixLabel, money, pct, signedPct, TAX_RATES } from "@/lib/ledger";
import type { PortfolioState, TimelineEvent } from "@/lib/types";

/**
 * The inside of an opened portfolio: its numbers (with biggest bump next to
 * biggest drop), estimated taxes, a chart of each holding and the cash over
 * time with what happened along the way, the holdings, and the timeline.
 */

/** Stock colours inside one portfolio: the dataviz reference categorical order (validated on white). */
const STOCK_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
/** Cash as a line needs more ink than the light cash fill to stay visible. */
const CASH_LINE = "#8a8172";

export default function PortfolioDetail({
  state,
  baseline,
  startDate,
  waitingToStart,
}: {
  state: PortfolioState;
  /** Portfolio 1's state, for "vs portfolio 1" (absent on portfolio 1 itself). */
  baseline?: PortfolioState;
  startDate: string;
  waitingToStart: boolean;
}) {
  const spread = baseline && !waitingToStart ? state.returnOnInvested - baseline.returnOnInvested : undefined;
  const t = state.taxes;
  const span = (d?: [string, string]) => (d ? `${humanDate(d[0])} – ${humanDate(d[1])}` : undefined);

  return (
    <div className="space-y-6" data-testid="detail">
      {/* ---- numbers ---- */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-4">
        <Stat label="Cash invested" value={money(state.invested)} />
        <Stat
          label="Gain"
          value={`${state.profit >= 0 ? "+" : "−"}${money(Math.abs(state.profit))} (${signedPct(state.returnOnInvested)})`}
          tone={state.profit >= 0 ? "gain" : "loss"}
        />
        <Stat
          label="Biggest drop"
          value={waitingToStart ? "—" : pct(state.maxDrawdown)}
          tone={state.maxDrawdown < -0.0005 ? "loss" : undefined}
          hint={`The worst fall from a high point along the way${
            state.maxDrawdownDates ? ` (${span(state.maxDrawdownDates)})` : ""
          }. Weekly deposits are left out, so they never hide a fall.`}
        />
        <Stat
          label="Biggest bump"
          value={waitingToStart ? "—" : signedPct(state.maxRunUp)}
          tone={state.maxRunUp > 0.0005 ? "gain" : undefined}
          hintAlign="right"
          hint={`The biggest climb from a low point to a later high${
            state.maxRunUpDates && state.maxRunUp > 0 ? ` (${span(state.maxRunUpDates)})` : ""
          }. Weekly deposits are left out, so they never inflate it.`}
        />
        <Stat
          label="Risk %"
          value={waitingToStart ? "—" : pct(state.volatility)}
          hint="How much the value typically swings in a year (its volatility). The higher it is, the bumpier the ride."
        />
        {baseline ? (
          <Stat
            label="vs portfolio 1"
            value={spread === undefined ? "—" : signedPct(spread)}
            tone={spread === undefined ? undefined : spread >= 0 ? "gain" : "loss"}
          />
        ) : (
          <Stat label="Started" value={humanDate(startDate)} />
        )}
        <Stat label="In cash now" value={money(state.cash + Object.values(state.waiting).reduce((a, b) => a + b, 0))} />
        <Stat label="Prices through" value={humanDate(state.lastDate)} hintAlign="right" />
      </dl>

      {/* ---- taxes ---- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <TaxCard
          title="Tax if sold today"
          kicker="potential"
          amount={t.potentialTax}
          shortTerm={t.unrealizedShort}
          longTerm={t.unrealizedLong}
          testId="tax-potential"
          note="If everything were sold at the last close."
        />
        <TaxCard
          title="Tax owed so far"
          kicker="actual"
          amount={t.actualTax}
          shortTerm={t.realizedShort}
          longTerm={t.realizedLong}
          testId="tax-actual"
          note={
            state.realized.length
              ? "On the sales so far, including mix switches."
              : "Nothing has been sold yet, and tax is only owed when you sell. Changing the mix replays the portfolio from its start, so it doesn't count as a sale."
          }
        />
      </div>
      <p className="-mt-3 text-[11px] leading-snug text-muted">
        Estimates at {pct(TAX_RATES.longTerm, 0)} on gains from shares held over a year and {pct(TAX_RATES.shortTerm, 0)} on
        shares held a year or less, with losses offsetting gains. Your real rates depend on your income and state.
      </p>

      {/* ---- what it held, over time ---- */}
      <section aria-labelledby="holdings-chart-title">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 id="holdings-chart-title" className="text-[14px] font-medium">
            What it held, over time
          </h3>
          <span className="micro">each holding on its own line, from the day it was bought</span>
        </div>
        <HoldingsChart state={state} />
      </section>

      {/* ---- holdings now ---- */}
      <HoldingsTable state={state} />

      {/* ---- timeline ---- */}
      <section aria-labelledby="timeline-title">
        <h3 id="timeline-title" className="mb-2 text-[14px] font-medium">
          What happened
        </h3>
        <ol className="m-0 list-none space-y-1.5 p-0 text-[13px]" data-testid="detail-timeline">
          {state.events.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="num w-[92px] shrink-0 text-muted">{humanDate(e.date)}</span>
              <span>{eventText(e)}</span>
            </li>
          ))}
          {!state.events.length && <li className="text-muted">Nothing yet: the first purchase happens at the next close.</li>}
        </ol>
      </section>
    </div>
  );
}

function TaxCard({
  title,
  kicker,
  amount,
  shortTerm,
  longTerm,
  note,
  testId,
}: {
  title: string;
  kicker: string;
  amount: number;
  shortTerm: number;
  longTerm: number;
  note: string;
  testId: string;
}) {
  const gain = (n: number) => `${n >= 0 ? "" : "−"}${money(Math.abs(n))}`;
  return (
    <div className="rounded-sm border border-rule bg-paper/60 p-3" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="micro">{kicker}</span>
      </div>
      <div className="figure mt-1 text-[24px] leading-none" data-testid={`${testId}-amount`}>
        {money(amount)}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 text-[12px]">
        <div>
          <dt className="text-muted">Short-term gains</dt>
          <dd className="num">{gain(shortTerm)}</dd>
        </div>
        <div>
          <dt className="text-muted">Long-term gains</dt>
          <dd className="num">{gain(longTerm)}</dd>
        </div>
      </dl>
      <p className="mb-0 mt-2 text-[11px] leading-snug text-muted">{note}</p>
    </div>
  );
}

function eventText(e: TimelineEvent): string {
  const names = (e.tickers ?? []).join(", ");
  switch (e.kind) {
    case "start":
      return `Bought ${mixLabel(e.weights)} with ${money(e.amount ?? 0)}.`;
    case "mix":
      return `Switched to ${mixLabel(e.weights)}, moving ${money(e.amount ?? 0)}.`;
    case "waiting":
      return `${names} ${e.tickers!.length > 1 ? "weren't" : "wasn't"} trading yet, so ${e.tickers!.length > 1 ? "their" : "its"} share was held as cash.`;
    case "bought_in":
      return `${names} started trading, and the cash set aside for it was invested at that day's close.`;
    case "buy":
      return `Bought ${money(e.amount ?? 0)} of ${names}.`;
    case "sell":
      return `Sold ${money(e.amount ?? 0)} of ${names}.`;
  }
}

/** Short labels for the markers on the chart. */
function markerLabel(e: TimelineEvent): string {
  switch (e.kind) {
    case "start":
      return "Start";
    case "mix":
      return "Mix change";
    case "waiting":
      return `${(e.tickers ?? []).join(", ")} in cash`;
    case "bought_in":
      return `${(e.tickers ?? []).join(", ")} bought`;
    case "buy":
      return `Bought ${(e.tickers ?? []).join(", ")}`;
    case "sell":
      return `Sold ${(e.tickers ?? []).join(", ")}`;
  }
}

/** Points drawn per series: enough for detail, few enough to stay quick over decades of days. */
const MAX_POINTS = 360;

/**
 * One line per holding, each on its own path: a stock's line starts on the day
 * it was bought and ends if it's sold, so buying something new never looks like
 * the others dipped. Cash (money set aside or not yet invested) is a dashed
 * line while there is any. Dashed verticals mark the start, mix changes, waits
 * in cash and buy-ins. Hover (or tap) for the values on a day.
 */
function HoldingsChart({ state }: { state: PortfolioState }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = state.dates.length;

  const model = useMemo(() => {
    if (n < 2) return null;
    // Tickers in the order they were first held; cash last.
    const tickers = Object.keys(state.byTicker).sort(
      (a, b) => state.byTicker[a].findIndex((v) => v > 0) - state.byTicker[b].findIndex((v) => v > 0) || (a < b ? -1 : 1),
    );
    const hasCash = state.cashSeries.some((c) => c > 0.5);
    const series = [
      ...tickers.map((t, i) => ({ key: t, color: STOCK_COLORS[i % STOCK_COLORS.length], values: state.byTicker[t], dashed: false })),
      ...(hasCash ? [{ key: "Cash", color: CASH_LINE, values: state.cashSeries, dashed: true }] : []),
    ];
    const step = Math.max(1, Math.ceil(n / MAX_POINTS));
    // Each series is drawn only while it holds something: one piece per stretch,
    // with its exact first and last day kept so a purchase starts where it happened.
    const lines = series.map((s) => {
      const pieces: number[][] = [];
      let i = 0;
      while (i < n) {
        if ((s.values[i] ?? 0) <= 0.5) {
          i++;
          continue;
        }
        const from = i;
        while (i < n && (s.values[i] ?? 0) > 0.5) i++;
        const to = i - 1;
        const pts = [from];
        for (let k = Math.ceil((from + 1) / step) * step; k < to; k += step) pts.push(k);
        if (to !== from) pts.push(to);
        pieces.push(pts);
      }
      return { ...s, pieces };
    });
    const hi = Math.max(1, ...series.map((s) => Math.max(0, ...s.values)));
    return { lines, hi: niceCeil(hi) };
  }, [state, n]);

  if (!model) return <p className="text-[13px] text-muted">The chart appears after the first close.</p>;

  const { lines, hi } = model;
  const W = 1000;
  const H = 260;
  const PAD = 10; // room at the top so the highest line isn't clipped
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - (v / hi) * (H - PAD);
  const yPct = (v: number) => (y(v) / H) * 100;
  const grid = [0.25, 0.5, 0.75, 1].map((f) => f * hi);

  // One line per day; events on the same day share it ("Start · SNOW in cash").
  const markers: { i: number; key: string; label: string; row: number }[] = [];
  for (const e of state.events) {
    const i = state.dates.indexOf(e.date);
    if (i < 0) continue;
    const same = markers.find((m) => m.i === i);
    if (same) same.label += ` · ${markerLabel(e)}`;
    else markers.push({ i, key: `${e.kind}-${i}`, label: markerLabel(e), row: 0 });
  }
  // Labels too close to the previous one drop to a second row instead of overlapping.
  for (let k = 1; k < markers.length; k++) {
    const prev = markers[k - 1];
    const gap = (markers[k].i - prev.i) / (n - 1);
    if (gap < Math.min(0.35, prev.label.length * 0.009)) markers[k].row = prev.row ? 0 : 1;
  }

  const onMove = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setHover(Math.round(f * (n - 1)));
  };
  const h = hover;
  const held = (l: { values: number[] }, i: number) => (l.values[i] ?? 0) > 0.5;

  return (
    <div>
      <div
        ref={box}
        className="relative h-[220px] select-none md:h-[260px]"
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        data-testid="detail-chart"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Value of each holding over time: ${lines
            .map((l) => `${l.key} ${money(l.values[n - 1] ?? 0)}`)
            .join(", ")} on ${humanDate(state.lastDate)}.`}
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          {grid.map((v) => (
            <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="#16191d" strokeOpacity="0.08" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={0} x2={W} y1={H} y2={H} stroke="#16191d" strokeOpacity="0.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {markers.map((m) => (
            <line
              key={m.key}
              x1={x(m.i)}
              x2={x(m.i)}
              y1={0}
              y2={H}
              stroke="#16191d"
              strokeOpacity="0.4"
              strokeWidth="1"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {lines.map((l) =>
            l.pieces.map((pts, k) => (
              <path
                key={`${l.key}-${k}`}
                d={pts.map((i, j) => `${j ? "L" : "M"}${x(i).toFixed(1)} ${y(l.values[i]).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={l.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={l.dashed ? "5 4" : undefined}
                vectorEffect="non-scaling-stroke"
                data-testid="detail-line"
                data-series={l.key}
                data-from={state.dates[pts[0]]}
              />
            )),
          )}
          {h !== null && (
            <line x1={x(h)} x2={x(h)} y1={0} y2={H} stroke="#16191d" strokeOpacity="0.6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {/* Value scale on the left, quietly (not the top line, where the event labels sit). */}
        {grid.slice(0, -1).map((v) => (
          <span
            key={`g-${v}`}
            className="num pointer-events-none absolute left-0 -translate-y-full pb-0.5 text-[10px] text-muted"
            style={{ top: `${yPct(v)}%` }}
          >
            {money(v)}
          </span>
        ))}

        {/* A dot where each line starts (the day it was bought), and on hover. */}
        {lines.map((l) =>
          l.pieces.map((pts, k) => (
            <span
              key={`start-${l.key}-${k}`}
              aria-hidden
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface"
              style={{ left: `${(pts[0] / (n - 1)) * 100}%`, top: `${yPct(l.values[pts[0]])}%`, borderColor: l.color }}
            />
          )),
        )}
        {h !== null &&
          lines.map((l) =>
            held(l, h) ? (
              <span
                key={`hover-${l.key}`}
                aria-hidden
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                style={{ left: `${(h / (n - 1)) * 100}%`, top: `${yPct(l.values[h])}%`, background: l.color }}
              />
            ) : null,
          )}

        {/* Marker labels along the top. */}
        {markers.map((m) => (
          <span
            key={`label-${m.key}`}
            className={`pointer-events-none absolute ${m.row ? "top-4" : "top-0"} whitespace-nowrap rounded-sm bg-surface/90 px-1 text-[10px] font-medium text-ink ${
              m.i / (n - 1) > 0.75 ? "-translate-x-full" : ""
            }`}
            style={{ left: `calc(${(m.i / (n - 1)) * 100}% ${m.i / (n - 1) > 0.75 ? "- 3px" : "+ 3px"})` }}
            data-testid="detail-marker"
          >
            {m.label}
          </span>
        ))}

        {h !== null && (
          <div
            className={`pointer-events-none absolute top-9 z-10 w-48 rounded-sm border border-rule bg-surface p-2 text-[12px] shadow-sm ${
              h / (n - 1) > 0.6 ? "-translate-x-full" : ""
            }`}
            style={{ left: `calc(${(h / (n - 1)) * 100}% ${h / (n - 1) > 0.6 ? "- 8px" : "+ 8px"})` }}
            role="status"
          >
            <div className="mb-1 font-medium">{humanDate(state.dates[h])}</div>
            {[...lines]
              .filter((l) => held(l, h))
              .sort((a, b) => b.values[h] - a.values[h])
              .map((l) => (
                <div key={l.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Swatch color={l.color} dashed={l.dashed} />
                    {l.key}
                  </span>
                  <span className="num">{money(l.values[h])}</span>
                </div>
              ))}
            <div className="mt-1 flex justify-between border-t border-rule pt-1 font-medium">
              <span>Worth</span>
              <span className="num">{money(state.values[h])}</span>
            </div>
          </div>
        )}
      </div>

      {/* Key: every line, named, with its value now. */}
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px]" data-testid="detail-legend">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-1.5">
            <Swatch color={l.color} dashed={l.dashed} />
            <span className="text-ink">{l.key}</span>
            <span className="num text-muted">{money(l.values[n - 1] ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A short line in the series' colour, dashed for cash, matching the chart. */
function Swatch({ color, dashed }: { color: string; dashed: boolean }) {
  return (
    <svg aria-hidden width="16" height="6" className="shrink-0">
      <line x1="1" x2="15" y1="3" y2="3" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}

/** Round a chart's top up to a tidy number (1, 2, 2.5 or 5 × a power of ten). */
function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function HoldingsTable({ state }: { state: PortfolioState }) {
  const waiting = Object.entries(state.waiting);
  if (!state.holdings.length && !waiting.length) return null;
  return (
    <section aria-labelledby="holdings-title">
      <h3 id="holdings-title" className="mb-2 text-[14px] font-medium">
        Holdings now
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]" data-testid="detail-holdings">
          <thead>
            <tr className="border-b border-rule text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="py-1.5 pr-3 font-medium">Holding</th>
              <th className="py-1.5 pr-3 text-right font-medium">Shares</th>
              <th className="py-1.5 pr-3 text-right font-medium">Price</th>
              <th className="py-1.5 pr-3 text-right font-medium">Worth</th>
              <th className="py-1.5 pr-3 text-right font-medium">Paid</th>
              <th className="py-1.5 text-right font-medium">Gain</th>
            </tr>
          </thead>
          <tbody>
            {state.holdings.map((h) => {
              const gain = h.value - h.cost;
              return (
                <tr key={h.ticker} className="border-b border-rule/60">
                  <td className="py-1.5 pr-3 font-medium">{h.ticker}</td>
                  <td className="num py-1.5 pr-3 text-right">{h.units.toLocaleString("en-US", { maximumFractionDigits: SHARE_DECIMALS })}</td>
                  <td className="num py-1.5 pr-3 text-right">{money(h.price, 2)}</td>
                  <td className="num py-1.5 pr-3 text-right">{money(h.value)}</td>
                  <td className="num py-1.5 pr-3 text-right">{money(h.cost)}</td>
                  <td className={`num py-1.5 text-right ${gain >= 0 ? "text-gain" : "text-loss"}`}>
                    {gain >= 0 ? "+" : "−"}
                    {money(Math.abs(gain))}
                    {h.cost > 0 ? ` (${signedPct(gain / h.cost)})` : ""}
                  </td>
                </tr>
              );
            })}
            {waiting.map(([t, amt]) => (
              <tr key={`w-${t}`} className="border-b border-rule/60 text-muted">
                <td className="py-1.5 pr-3 font-medium">{t}</td>
                <td className="py-1.5 pr-3 text-right" colSpan={2}>
                  not trading yet
                </td>
                <td className="num py-1.5 pr-3 text-right">{money(amt)}</td>
                <td className="py-1.5 text-right" colSpan={2}>
                  held as cash
                </td>
              </tr>
            ))}
            {state.cash > 0.5 && (
              <tr className="border-b border-rule/60 text-muted" data-testid="detail-cash-row">
                <td className="py-1.5 pr-3 font-medium">Cash</td>
                <td className="py-1.5 pr-3 text-right" colSpan={2}>
                  not in shares
                </td>
                <td className="num py-1.5 pr-3 text-right">{money(state.cash)}</td>
                <td className="py-1.5 text-right" colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
