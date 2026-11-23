import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AS_OF, WHAT_IFS, type WhatIf } from "@/landing/whatIfData";

const BASE = import.meta.env.BASE_URL;
const serif = { fontFamily: "Newsreader, Georgia, serif" } as const;

/** How long each story stays up before the next one. */
const STEP_MS = 10_000;

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("en-US")}%`;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Four "what if you'd bought…" stories, one at a time: the portrait flush with
 * the left edge of the screen, and beside it the title, how it played out, and
 * a chart of the $10,000 from the day it went in to Nov 2, 2026. Moves on every
 * 10 seconds (not for people who ask for less motion), pauses while the pointer
 * or keyboard focus is inside, and can be swiped or picked by ticker.
 */
/** The last slide: the visitor, today, with three made-up futures. */
const YOU = {
  key: "you",
  label: "You",
  photo: "you",
  alt: "An outline of a person labelled \"You\", sitting at a laptop",
  focus: "50% 30%",
};

/** Every slide's pill and portrait: the four real stories, then "You". */
const SLIDES = [
  ...WHAT_IFS.map((w) => ({ key: w.key, label: w.ticker, photo: w.photo, alt: w.alt, focus: w.focus, title: w.title })),
  { ...YOU, title: "What if you invest $10,000 today?" },
];
const COUNT = SLIDES.length;

export default function WhatIfStories({ labelledBy }: { labelledBy?: string } = {}) {
  const [at, setAt] = useState(0);
  const [pick, setPick] = useState(0); // bumped on every pick, to restart the wait
  const [auto] = useState(() => !prefersReducedMotion());
  const [held, setHeld] = useState(false);
  const playing = auto && !held;
  const isYou = at === WHAT_IFS.length;
  const s = WHAT_IFS[Math.min(at, WHAT_IFS.length - 1)];

  const go = (i: number) => {
    setAt((i + COUNT) % COUNT);
    setPick((n) => n + 1);
  };

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setAt((i) => (i + 1) % COUNT), STEP_MS);
    return () => window.clearTimeout(t);
  }, [at, pick, playing]);

  // Swipe left/right on touch screens.
  const touchX = useRef<number | null>(null);

  const end = s.values[s.values.length - 1];
  const change = (end / s.values[0] - 1) * 100;
  const up = end >= s.values[0];

  return (
    <section
      aria-roledescription="carousel"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : "What $10,000 could have become"}
      className="border-y border-rule bg-surface"
      data-testid="whatif"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const from = touchX.current;
        touchX.current = null;
        if (from === null) return;
        const dx = e.changedTouches[0].clientX - from;
        if (Math.abs(dx) > 50) go(at + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="grid md:grid-cols-[minmax(300px,36vw)_1fr]">
        {/* Portrait: flush with the left edge of the screen. */}
        <div className="relative aspect-[4/3] overflow-hidden bg-paper md:aspect-auto md:min-h-[620px]">
          {SLIDES.map((w, i) => (
            <img
              key={w.key}
              src={`${BASE}landing/whatif/${w.photo}-960.webp`}
              srcSet={`${BASE}landing/whatif/${w.photo}-480.webp 480w, ${BASE}landing/whatif/${w.photo}-960.webp 960w`}
              sizes="(min-width: 768px) 36vw, 100vw"
              alt={i === at ? w.alt : ""}
              aria-hidden={i !== at}
              loading={i === 0 ? "eager" : "lazy"}
              width={1122}
              height={1402}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${
                i === at ? "opacity-100" : "opacity-0"
              }`}
              style={{ objectPosition: w.focus }}
              data-testid={i === at ? "whatif-photo" : undefined}
            />
          ))}
        </div>

        <div className="flex min-w-0 flex-col px-6 py-8 md:px-12 md:py-12 lg:px-16">
          <div className="mb-7 flex flex-wrap items-center gap-2" role="group" aria-label="Pick a story">
            {SLIDES.map((w, i) => {
              const on = i === at;
              return (
                <button
                  key={w.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${w.label}: ${w.title}`}
                  onClick={() => go(i)}
                  className={`relative min-h-11 overflow-hidden rounded-full border px-4 text-[14px] font-medium transition-colors ${
                    on ? "border-ink bg-ink text-paper" : "border-[#d9cfbe] bg-surface text-ink hover:border-ink"
                  }`}
                  data-testid={`whatif-pick-${w.key}`}
                >
                  {w.label}
                  {on && playing && (
                    <span
                      key={`${w.key}-${pick}`}
                      aria-hidden
                      className="pill-progress absolute bottom-0 left-0 h-[3px] w-full bg-paper/70"
                      style={{ animationDuration: `${STEP_MS}ms` }}
                    />
                  )}
                </button>
              );
            })}
            <span className="ml-1 hidden text-[13px] text-muted sm:inline" aria-hidden>
              {at + 1} of {COUNT}
            </span>
          </div>

          {isYou ? (
            <div
              key="you"
              className="whatif-in flex flex-1 flex-col"
              role="group"
              aria-roledescription="slide"
              aria-label={`${COUNT} of ${COUNT}`}
              aria-live={playing ? "off" : "polite"}
            >
              <YouSlide />
            </div>
          ) : (
          <div
            key={s.key}
            className="whatif-in flex flex-1 flex-col"
            role="group"
            aria-roledescription="slide"
            aria-label={`${at + 1} of ${COUNT}`}
            aria-live={playing ? "off" : "polite"}
          >
            <h3
              style={{ ...serif, fontSize: "clamp(26px, 2.6vw, 36px)" }}
              className="m-0 max-w-[720px] font-normal leading-[1.15]"
              data-testid="whatif-title"
            >
              {s.title}
            </h3>
            <p className="mb-0 mt-3 max-w-[640px] text-[16px] leading-[1.55] text-[#3d3a36]" data-testid="whatif-story">
              {s.story}
            </p>

            <div className="mt-7 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="m-0 text-[12px] uppercase tracking-[0.06em] text-muted">Worth on {AS_OF}</p>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <p style={serif} className="m-0 text-[52px] leading-none" data-testid="whatif-worth">
                {money(end)}
              </p>
              <p className={`m-0 text-[18px] font-medium ${up ? "text-gain" : "text-loss"}`}>{pct(change)}</p>
            </div>

            <Chart story={s} up={up} />

            <p className="mb-0 mt-4 text-[12px] leading-[1.5] text-muted">
              $10,000 at the close on the day it went in (the next trading day for a weekend), to the close on {AS_OF}.
              Real daily prices, adjusted for splits, with dividends reinvested. Picked with hindsight to show what can
              happen. It isn't a prediction or advice.{" "}
              <Link to="/start" className="text-accent underline underline-offset-2">
                Try your own what-ifs with pretend money.
              </Link>
            </p>
          </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The $10,000 over time: no dates, a dashed line where it started, and a dot
 * on the final value. The SVG stretches to a fixed height; labels and the dot
 * are HTML on top, so they stay full size on a phone.
 */
function Chart({ story, up }: { story: WhatIf; up: boolean }) {
  const W = 640;
  const H = 240;
  const vals = story.values;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  // Fractions of the box, leaving room above for the line and below for the baseline.
  const fx = (i: number) => i / (vals.length - 1);
  const fy = (v: number) => 0.04 + (1 - (v - lo) / (hi - lo || 1)) * 0.92;
  const line = vals.map((v, i) => `${i ? "L" : "M"}${(fx(i) * W).toFixed(1)} ${(fy(v) * H).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const color = up ? "#1b6b4a" : "#a03a28";
  const startTop = fy(vals[0]) * 100;
  const endTop = fy(vals[vals.length - 1]) * 100;
  const gid = `whatif-fill-${story.key}`;

  return (
    <figure className="relative m-0 mt-6 h-[190px] md:h-[240px]" data-testid="whatif-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${story.ticker}: $10,000 became ${money(vals[vals.length - 1])}. High ${money(hi)}, low ${money(lo)}.`}
        className="absolute inset-0 block h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={H} x2={W} y2={H} stroke="#e4dcce" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line
          x1="0"
          y1={(startTop / 100) * H}
          x2={W}
          y2={(startTop / 100) * H}
          stroke="#b8ad9c"
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden
        className={`absolute left-1 text-[12px] text-muted ${startTop < 12 ? "translate-y-1" : "-translate-y-full -mt-1"}`}
        style={{ top: `${startTop}%` }}
      >
        $10,000 in
      </span>
      <span
        aria-hidden
        className="absolute right-0 size-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white"
        style={{ top: `${endTop}%`, background: color }}
      />
    </figure>
  );
}

// ---- the "You" slide ----------------------------------------------------------------

/**
 * Three made-up futures for $10,000 put in today. They are an illustration of
 * how differently the same money can go, not a forecast: each is a random
 * wobble (fixed seed, so it looks the same every visit) pinned to an end value.
 */
const FUTURES = [
  { key: "up-big", name: "Takes off", end: 31_000, vol: 0.03, seed: 21, color: "#1b6b4a" },
  { key: "steady", name: "Grows steadily", end: 14_000, vol: 0.016, seed: 8, color: "#8a5a12" },
  { key: "down", name: "Falls", end: 6_000, vol: 0.024, seed: 5, color: "#a03a28" },
] as const;

/** Trading days drawn per path, like the ~160 on the real stories. */
const STEPS = 160;

/** A small seeded random-number generator (mulberry32), so the paths never change. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A stock-like path from $10,000 to `end`: daily moves that are mostly small
 * with the odd big jump (as real prices have), then bent so it finishes
 * exactly at `end`.
 */
function futurePath(end: number, vol: number, seed: number): number[] {
  const r = rng(seed);
  const walk = [0];
  for (let i = 1; i <= STEPS; i++) {
    const normal = (r() + r() + r() + r() - 2) * 1.73; // ~N(0, 1)
    const jump = r() < 0.04 ? (r() < 0.5 ? -1 : 1) * 3 : 0;
    walk.push(walk[i - 1] + (normal + jump) * vol);
  }
  const drift = Math.log(end / 10_000);
  return walk.map((w, i) => {
    const t = i / STEPS;
    return 10_000 * Math.exp(drift * t + w - walk[STEPS] * t);
  });
}

const PATHS = FUTURES.map((f) => ({ ...f, values: futurePath(f.end, f.vol, f.seed) }));

const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

function YouSlide() {
  const [raw, setRaw] = useState("");
  const ticker = raw.trim().toUpperCase();
  const valid = TICKER_RE.test(ticker);
  const named = valid ? ticker : "it";

  return (
    <>
      <h3
        style={{ ...serif, fontSize: "clamp(26px, 2.6vw, 36px)" }}
        className="m-0 max-w-[760px] font-normal leading-[1.25]"
        data-testid="whatif-title"
      >
        What if I invest $10,000 today in{" "}
        {/* The box is exactly as wide as its text (or the placeholder): a hidden copy of
            the text sets the width and the input fills it, so nothing gets cut off. */}
        <label className="inline-grid max-w-full align-baseline">
          <span className="sr-only">Stock ticker</span>
          <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre border-b-2 border-transparent pr-[0.15em]">
            {raw || "Enter Stock Ticker"}
          </span>
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value.toUpperCase().slice(0, 12))}
            placeholder="Enter Stock Ticker"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            size={1}
            className="col-start-1 row-start-1 w-full min-w-0 border-0 border-b-2 border-dashed border-accent bg-transparent p-0 font-[inherit] text-accent placeholder:text-accent/50 focus:border-solid focus:outline-none"
            style={{ fontSize: "inherit" }}
            data-testid="whatif-ticker-input"
          />
        </label>
        ?
      </h3>
      <p className="mb-0 mt-3 max-w-[640px] text-[16px] leading-[1.55] text-[#3d3a36]" data-testid="whatif-story">
        Nobody knows which way {valid ? ticker : "a stock"} will go from here. Pick it today, follow it with pretend money,
        and find out without risking a dollar.
      </p>

      <p className="mb-0 mt-7 text-[12px] uppercase tracking-[0.06em] text-muted">Three ways it could go</p>
      <FutureChart ticker={valid ? ticker : undefined} />

      <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          to="/start"
          className="inline-flex min-h-12 items-center rounded-md bg-accent px-6 text-[15px] font-semibold text-paper no-underline hover:bg-[#163a2e]"
          data-testid="whatif-you-cta"
        >
          {valid ? `Track ${ticker} with pretend money` : "Start with pretend money"}
        </Link>
      </div>

      <p className="mb-0 mt-4 text-[12px] leading-[1.5] text-muted">
        Illustration only: these three paths are made up to show how differently the same $10,000 can go. They aren't a
        forecast for {named === "it" ? "any stock" : named}, and it isn't advice.
      </p>
    </>
  );
}

/**
 * Three made-up paths fanning out from today's $10,000, drawn like the real
 * stories' charts (solid lines, a dashed "$10,000 in" line, a dot at each
 * end) with a light band showing the spread between the best and worst path.
 */
function FutureChart({ ticker }: { ticker?: string }) {
  const W = 640;
  const H = 240;
  const all = PATHS.flatMap((p) => p.values);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  // The paths use the left 76%; the end labels sit to the right.
  const fx = (i: number) => (i / STEPS) * 0.76;
  const fy = (v: number) => 0.04 + (1 - (v - lo) / (hi - lo)) * 0.92;
  const startTop = fy(10_000) * 100;
  const pt = (i: number, v: number) => `${(fx(i) * W).toFixed(1)} ${(fy(v) * H).toFixed(1)}`;

  // The band between the highest and lowest path on each day.
  const top = Array.from({ length: STEPS + 1 }, (_, i) => Math.max(...PATHS.map((p) => p.values[i])));
  const bottom = Array.from({ length: STEPS + 1 }, (_, i) => Math.min(...PATHS.map((p) => p.values[i])));
  const band =
    top.map((v, i) => `${i ? "L" : "M"}${pt(i, v)}`).join(" ") +
    " " +
    bottom
      .map((v, i) => [i, v] as const)
      .reverse()
      .map(([i, v]) => `L${pt(i, v)}`)
      .join(" ") +
    " Z";

  return (
    <figure className="relative m-0 mt-3 h-[210px] md:h-[240px]" data-testid="whatif-future-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Three made-up futures for $10,000 invested today${ticker ? ` in ${ticker}` : ""}: ${PATHS.map(
          (p) => `${p.name.toLowerCase()} to ${money(p.end)}`,
        ).join(", ")}.`}
        className="absolute inset-0 block h-full w-full overflow-visible"
      >
        <line x1="0" y1={H} x2={W * fx(STEPS)} y2={H} stroke="#e4dcce" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={band} fill="#1d1b19" fillOpacity="0.045" />
        <line
          x1="0"
          y1={(startTop / 100) * H}
          x2={W * fx(STEPS)}
          y2={(startTop / 100) * H}
          stroke="#b8ad9c"
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        {PATHS.map((p) => (
          <path
            key={p.key}
            d={p.values.map((v, i) => `${i ? "L" : "M"}${pt(i, v)}`).join(" ")}
            fill="none"
            stroke={p.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* "Today": where all three start. */}
      <span
        aria-hidden
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink"
        style={{ left: 0, top: `${startTop}%` }}
      />
      <span aria-hidden className="absolute left-0 top-full mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
        Today <span className="font-normal normal-case tracking-normal text-muted">· $10,000 in</span>
      </span>

      {/* Each path's end: a dot in its colour, then the value and name in ink. */}
      {PATHS.map((p) => {
        const top = fy(p.end) * 100;
        return (
          <span
            key={p.key}
            aria-hidden
            className="absolute flex -translate-y-1/2 items-center gap-2"
            style={{ left: `${fx(STEPS) * 100}%`, top: `${top}%` }}
          >
            <span className="-ml-1.5 size-3 shrink-0 rounded-full border-2 border-white" style={{ background: p.color }} />
            <span className="whitespace-nowrap text-[12px] leading-tight" data-testid={`whatif-future-${p.key}`}>
              <strong className="font-semibold text-ink">{money(p.end)}</strong>
              <span className="block text-muted">{p.name}</span>
            </span>
          </span>
        );
      })}
    </figure>
  );
}
