import { useMemo, useState } from "react";
import type { PortfolioState } from "@/lib/types";
import { humanDate, money, shortDate } from "@/lib/ledger";

/**
 * Bold, clearly separate line colours: blue, red, gold (a deep yellow, since a
 * bright yellow is too faint on white). Checked with the dataviz palette
 * validator: lightness, chroma, colour-blind separation and contrast all pass.
 */
export const SERIES_COLORS = ["#1D4ED8", "#C8102E", "#B8860B"];
const STROKE = SERIES_COLORS;

type Props = {
  states: PortfolioState[];
  baselineId?: string;
  height?: number;
  /** Colour per series id. Lets a series keep its colour when another is missing. */
  colors?: Record<string, string>;
  /** Name shown for each series id in the legend and tooltip (e.g. "Portfolio 2"). */
  labels?: Record<string, string>;
  /** Each series' current mix (ticker → weight 0–1), listed when its legend entry is hovered or tapped. */
  mixes?: Record<string, Record<string, number> | undefined>;
};

type Hover = { x: number; i: number } | null;

export default function PathChart({ states, baselineId, height = 300, colors, labels, mixes }: Props) {
  const [hover, setHover] = useState<Hover>(null);
  const [legendOpen, setLegendOpen] = useState<string | null>(null);
  const nameOf = (s: { id: string; name: string }) => labels?.[s.id] ?? s.name;

  const model = useMemo(() => {
    const dates = [...new Set(states.flatMap((s) => s.dates))].sort();
    if (dates.length < 2) return null;

    const maps = states.map((s) => {
      const m = new Map<string, number>();
      s.dates.forEach((d, i) => m.set(d, s.values[i]));
      return m;
    });

    // Carry the last known value forward so a portfolio that starts later does not
    // silently vanish from the left of the chart.
    const series = maps.map((m) => {
      let last = NaN;
      return dates.map((d) => {
        const v = m.get(d);
        if (v !== undefined) last = v;
        return last;
      });
    });

    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) for (const v of s) {
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (!Number.isFinite(lo)) return null;

    const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
    const min = Math.max(0, lo - pad);
    const max = hi + pad;

    // Keep the path light on long histories.
    const step = Math.max(1, Math.floor(dates.length / 420));
    const idx: number[] = [];
    for (let i = 0; i < dates.length; i += step) idx.push(i);
    if (idx[idx.length - 1] !== dates.length - 1) idx.push(dates.length - 1);

    const W = 720;
    const H = height;
    const m = { t: 14, r: 8, b: 24, l: 52 };
    const x = (i: number) =>
      m.l + (dates.length === 1 ? 0 : (i / (dates.length - 1)) * (W - m.l - m.r));
    const y = (v: number) => m.t + (1 - (v - min) / (max - min || 1)) * (H - m.t - m.b);

    const lines = series.map((s, si) => {
      const pts = idx
        .filter((i) => Number.isFinite(s[i]))
        .map((i) => `${x(i).toFixed(1)},${y(s[i]).toFixed(1)}`);
      return { path: `M${pts.join("L")}`, color: colors?.[states[si].id] ?? STROKE[si % STROKE.length], name: nameOf(states[si]), id: states[si].id };
    });

    // Band between the best and worst path: the spread is the product's subject.
    const bandTop: string[] = [];
    const bandBottom: string[] = [];
    for (const i of idx) {
      const vals = series.map((s) => s[i]).filter((v) => Number.isFinite(v));
      if (!vals.length) continue;
      bandTop.push(`${x(i).toFixed(1)},${y(Math.max(...vals)).toFixed(1)}`);
      bandBottom.push(`${x(i).toFixed(1)},${y(Math.min(...vals)).toFixed(1)}`);
    }
    const band =
      bandTop.length > 1
        ? `M${bandTop.join("L")}L${bandBottom.reverse().join("L")}Z`
        : "";

    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) / ticks) * i);

    // X labels: ~5 evenly spaced dates.
    const xTicks: { i: number; label: string }[] = [];
    const n = 5;
    for (let k = 0; k < n; k++) {
      const i = Math.round((k / (n - 1)) * (dates.length - 1));
      xTicks.push({ i, label: shortDate(dates[i]) });
    }

    return { dates, series, min, max, W, H, m, x, y, lines, band, yTicks, xTicks, idx };
  }, [states, height, colors]);

  if (!model) {
    return (
      <div className="grid h-48 place-items-center text-sm text-muted">
        Not enough price history yet to draw a comparison.
      </div>
    );
  }

  const { dates, series, W, H, m, x, y, lines, band, yTicks, xTicks, idx } = model;
  const hoverI = hover ? idx[Math.min(idx.length - 1, hover.i)] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Portfolio value over time, one line per portfolio"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * W;
          if (rel < m.l || rel > W - m.r) return setHover(null);
          const frac = (rel - m.l) / (W - m.l - m.r);
          setHover({ x: rel, i: Math.round(frac * (idx.length - 1)) });
        }}
      >
        <defs>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F4D3D" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#1F4D3D" stopOpacity="0.02" />
          </linearGradient>
          {/* Reveal mask: the paths draw in from the left once, without needing
              each path's length. A width-based clip scales to any history length. */}
          <clipPath id="chartReveal">
            <rect
              x={m.l}
              y={0}
              width={Math.max(1, W - m.l - m.r)}
              height={H}
              className="reveal-rect"
            />
          </clipPath>
        </defs>

        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={m.l}
              x2={W - m.r}
              y1={y(v)}
              y2={y(v)}
              stroke="#E4DCCE"
              strokeWidth={1}
              strokeDasharray={i === 0 ? undefined : "2 4"}
            />
            <text x={m.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="#6E6862">
              {money(v)}
            </text>
          </g>
        ))}

        <g clipPath="url(#chartReveal)">
          {band && <path d={band} fill="url(#bandFill)" />}

          {lines.map((l) => (
            <path
              key={l.id}
              d={l.path}
              fill="none"
              stroke={l.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>

        {xTicks.map((t, i) => (
          <text
            key={i}
            x={x(t.i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontSize={10}
            fill="#6E6862"
          >
            {t.label}
          </text>
        ))}

        {hoverI !== null && (
          <g>
            <line
              x1={x(hoverI)}
              x2={x(hoverI)}
              y1={m.t}
              y2={H - m.b}
              stroke="#16191D"
              strokeOpacity={0.25}
              strokeWidth={1}
            />
            {series.map((s, si) =>
              Number.isFinite(s[hoverI]) ? (
                <circle
                  key={si}
                  cx={x(hoverI)}
                  cy={y(s[hoverI])}
                  r={3}
                  fill={colors?.[states[si].id] ?? STROKE[si % STROKE.length]}
                />
              ) : null,
            )}
          </g>
        )}
      </svg>

      {hoverI !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-sm border border-rule bg-surface p-3 text-xs shadow-sm"
          style={{
            left: `${Math.min(78, Math.max(2, (x(hoverI) / W) * 100))}%`,
          }}
        >
          <div className="micro mb-1.5">{humanDate(dates[hoverI])}</div>
          {states.map((s, si) => {
            const v = series[si][hoverI];
            if (!Number.isFinite(v)) return null;
            return (
              <div key={s.id} className="flex items-baseline justify-between gap-4 py-0.5">
                <span className="flex items-center gap-1.5 truncate text-muted">
                  <span
                    className="inline-block size-1.5 shrink-0 rounded-full"
                    style={{ background: colors?.[states[si].id] ?? STROKE[si % STROKE.length] }}
                  />
                  <span className="truncate">{nameOf(s)}</span>
                </span>
                <span className="num font-medium">{money(v)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
        {lines.map((l) => {
          const mix = Object.entries(mixes?.[l.id] ?? {}).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
          const open = legendOpen === l.id && mix.length > 0;
          return (
            <span key={l.id} className="relative">
              <button
                type="button"
                className="flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 text-xs text-muted hover:bg-paper hover:text-ink"
                onMouseEnter={() => setLegendOpen(l.id)}
                onMouseLeave={() => setLegendOpen((o) => (o === l.id ? null : o))}
                onFocus={() => setLegendOpen(l.id)}
                onBlur={() => setLegendOpen((o) => (o === l.id ? null : o))}
                onClick={() => setLegendOpen(l.id)} // a tap also fires hover, so only open; tapping elsewhere closes it
                aria-expanded={open}
                data-testid={`legend-${l.id}`}
              >
                <span className="inline-block h-[3px] w-5 rounded-full" style={{ background: l.color }} />
                {l.name}
                {l.id === baselineId && <span className="text-[10px] text-accent">baseline</span>}
              </button>
              {open && (
                // What's in this portfolio, largest share first.
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 block min-w-40 rounded-sm border border-rule bg-surface p-2.5 text-xs shadow-sm"
                >
                  {mix.map(([t, w]) => (
                    <span key={t} className="flex justify-between gap-4 py-0.5">
                      <span className="font-medium text-ink">{t}</span>
                      <span className="num text-muted">{Math.round(w * 1000) / 10}%</span>
                    </span>
                  ))}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
