import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AS_OF, WHAT_IFS, type WhatIf } from "@/landing/whatIfData";

const BASE = import.meta.env.BASE_URL;
const serif = { fontFamily: "Newsreader, Georgia, serif" } as const;

/** How long each story stays up before the next one. */
const STEP_MS = 7000;

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("en-US")}%`;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Four "what if you'd bought…" stories, one at a time: the portrait flush with
 * the left edge of the screen, and beside it the title, how it played out, and
 * a chart of the $10,000 from the day it went in to Nov 2, 2026. Moves on every
 * 7 seconds (not for people who ask for less motion), pauses while the pointer
 * or keyboard focus is inside, and can be swiped or picked by ticker.
 */
export default function WhatIfStories() {
  const [at, setAt] = useState(0);
  const [pick, setPick] = useState(0); // bumped on every pick, to restart the wait
  const [auto] = useState(() => !prefersReducedMotion());
  const [held, setHeld] = useState(false);
  const playing = auto && !held;
  const s = WHAT_IFS[at];

  const go = (i: number) => {
    setAt((i + WHAT_IFS.length) % WHAT_IFS.length);
    setPick((n) => n + 1);
  };

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setAt((i) => (i + 1) % WHAT_IFS.length), STEP_MS);
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
      aria-label="What $10,000 could have become"
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
          {WHAT_IFS.map((w, i) => (
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
            {WHAT_IFS.map((w, i) => {
              const on = i === at;
              return (
                <button
                  key={w.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${w.ticker}: ${w.title}`}
                  onClick={() => go(i)}
                  className={`relative min-h-11 overflow-hidden rounded-full border px-4 text-[14px] font-medium transition-colors ${
                    on ? "border-ink bg-ink text-paper" : "border-[#d9cfbe] bg-surface text-ink hover:border-ink"
                  }`}
                  data-testid={`whatif-pick-${w.key}`}
                >
                  {w.ticker}
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
              {at + 1} of {WHAT_IFS.length}
            </span>
          </div>

          <div
            key={s.key}
            className="whatif-in flex flex-1 flex-col"
            role="group"
            aria-roledescription="slide"
            aria-label={`${at + 1} of ${WHAT_IFS.length}`}
            aria-live={playing ? "off" : "polite"}
          >
            <h2
              style={{ ...serif, fontSize: "clamp(26px, 2.6vw, 36px)" }}
              className="m-0 max-w-[720px] font-normal leading-[1.15]"
              data-testid="whatif-title"
            >
              {s.title}
            </h2>
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
