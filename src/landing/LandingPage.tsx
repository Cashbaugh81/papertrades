import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { COLUMNS, DEFAULT_MOMENT, ENDINGS, MOMENTS, MOODS, PHOTO_ALT, SERIES } from "@/landing/data";

const BASE = import.meta.env.BASE_URL;
const serif = { fontFamily: "Newsreader, Georgia, serif" } as const;
const sans = { fontFamily: "Inter, system-ui, sans-serif" } as const;

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** A small line from Jan 2020 up to `upto`, scaled to that portfolio's own high. */
function sparkline(series: number[], upto: number) {
  const max = Math.max(...series);
  const n = series.length - 1;
  const x = (i: number) => (i / n) * 296 + 2;
  const y = (v: number) => 76 - (v / max) * 70;
  const d = (to: number) =>
    series
      .slice(0, to + 1)
      .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(" ");
  return { all: d(n), soFar: d(upto), dotX: x(upto), dotY: y(series[upto]) };
}

const pillBase =
  "min-h-11 whitespace-nowrap rounded-full border px-4 text-[14px] font-medium transition-colors duration-150";

export default function LandingPage() {
  const [key, setKey] = useState(DEFAULT_MOMENT);
  const at = Math.max(0, MOMENTS.findIndex((m) => m.key === key));
  const m = MOMENTS[at];

  const cols = useMemo(
    () =>
      COLUMNS.map((c, i) => {
        const [value, dd, mood] = m.cols[i];
        const gain = value - m.put;
        return {
          ...c,
          value,
          dd,
          gain,
          mood: MOODS[mood],
          chart: sparkline(SERIES[i], m.index),
        };
      }),
    [m],
  );

  return (
    <div style={sans} className="min-h-screen bg-paper text-ink">
      {/* ---- nav ---- */}
      <header className="border-b border-rule">
        <nav aria-label="Main" className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-6 py-[18px]">
          <Link to="/" className="flex items-baseline gap-2.5 text-ink no-underline">
            <span style={serif} className="text-[24px] font-medium">
              Ledger
            </span>
            <span className="hidden text-[12px] text-muted sm:inline">the same dollars, different paths</span>
          </Link>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px]">
            <a href="#how" className="text-ink no-underline hover:text-accent">
              How it works
            </a>
            <a href="#numbers" className="hidden text-ink no-underline hover:text-accent sm:inline">
              What you'll see
            </a>
            <Link to="/signin" className="text-ink no-underline hover:text-accent">
              Sign in
            </Link>
            <Link
              to="/start"
              className="inline-flex min-h-11 items-center rounded-md bg-accent px-[18px] text-[14px] font-semibold text-paper no-underline hover:bg-[#163a2e]"
            >
              Try it free
            </Link>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* ---- hero ---- */}
        <section aria-labelledby="hero-title" className="pb-8 pt-[72px]">
          <div className="mx-auto max-w-[1180px] px-6">
            <p className="mb-4 text-[13px] uppercase tracking-[0.08em] text-muted">
              Paper investing · real prices · not real money
            </p>
            <h1
              id="hero-title"
              style={{ ...serif, fontSize: "clamp(40px, 6vw, 72px)" }}
              className="m-0 max-w-[820px] font-normal leading-[1.02] tracking-[-0.02em]"
            >
              Test your stock skills for free.
            </h1>
          </div>

          {/* Full-width banner. Its painted button isn't real, so the whole image links to sign-up. */}
          <Link
            to="/start"
            aria-label="Learn. Practice. Invest smarter. Start with pretend money"
            className="mx-auto mt-10 block max-w-[2172px]"
            data-testid="landing-banner"
          >
            <img
              src={`${BASE}landing/banner-cropped-1280.webp`}
              srcSet={`${BASE}landing/banner-cropped-1280.webp 1280w, ${BASE}landing/banner-cropped-2172.webp 2172w`}
              sizes="100vw"
              width={2172}
              height={682}
              alt=""
              className="block h-auto w-full"
            />
          </Link>

          <div className="mx-auto mt-8 flex max-w-[1180px] flex-wrap items-center gap-5 px-6">
            <Link
              to="/start"
              className="inline-flex min-h-12 items-center rounded-md bg-accent px-6 text-[15px] font-semibold text-paper no-underline hover:bg-[#163a2e]"
            >
              Start with pretend money
            </Link>
            <a href="#how" className="inline-flex min-h-12 items-center px-1 text-[15px] font-medium text-ink underline decoration-[#c9bda8] underline-offset-4 hover:text-accent">
              How it works
            </a>
          </div>
        </section>

        {/* ---- the replay ---- */}
        <section aria-labelledby="replay-title" className="mx-auto max-w-[1180px] px-6 pb-4 pt-6">
          <h2 id="replay-title" className="sr-only">
            Six years, three portfolios, one person
          </h2>

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <StepButton label="Earlier moment" onClick={() => setKey(MOMENTS[Math.max(0, at - 1)].key)} dir="prev" />
            <div role="group" aria-label="Pick a moment" className="flex min-w-0 flex-[1_1_520px] flex-wrap gap-2">
              {MOMENTS.map((mm) => {
                const on = mm.key === m.key;
                return (
                  <button
                    key={mm.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setKey(mm.key)}
                    className={`${pillBase} ${on ? "border-ink bg-ink text-paper" : "border-[#d9cfbe] bg-surface text-ink hover:border-ink"}`}
                  >
                    {mm.label}
                  </button>
                );
              })}
            </div>
            <StepButton
              label="Later moment"
              onClick={() => setKey(MOMENTS[Math.min(MOMENTS.length - 1, at + 1)].key)}
              dir="next"
            />
          </div>

          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2" aria-live="polite">
            <p style={serif} className="m-0 text-[28px] leading-[1.2]">
              {m.label}
              <span className="text-muted"> · </span>
              {m.title}
            </p>
            <p className="m-0 text-[14px] text-muted">
              Put into each so far: <strong className="font-semibold text-ink">{money(m.put)}</strong>
            </p>
          </div>
          <p className="mb-6 max-w-[760px] text-[16px] leading-[1.55] text-[#3d3a36]">{m.story}</p>

          <div className="flex flex-wrap gap-5">
            {cols.map((c) => (
              <article
                key={c.name}
                data-testid="landing-col"
                className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-[10px] border border-rule bg-surface p-[22px]"
              >
                <header className="flex items-center gap-2.5">
                  <span aria-hidden className="h-1 w-[22px] shrink-0 rounded" style={{ background: c.color }} />
                  <div className="min-w-0">
                    <h3 className="m-0 text-[16px] font-semibold">{c.name}</h3>
                    <p className="m-0 mt-0.5 text-[12px] text-muted">{c.sub}</p>
                  </div>
                </header>

                <figure className="m-0 flex flex-col">
                  <div
                    className="relative aspect-[4/3] overflow-hidden rounded-t-lg"
                    style={{
                      WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 55%, rgba(0,0,0,0) 100%)",
                      maskImage: "linear-gradient(to bottom, #000 0%, #000 55%, rgba(0,0,0,0) 100%)",
                    }}
                  >
                    <img
                      src={`${BASE}landing/${c.mood.photo}.jpg`}
                      alt={`${PHOTO_ALT[c.mood.photo]}, checking the ${c.name.toLowerCase()} portfolio`}
                      width={720}
                      height={720}
                      loading="lazy"
                      className="block h-full w-full object-cover"
                      style={{ objectPosition: "50% 28%" }}
                    />
                  </div>
                  <figcaption style={serif} className="relative -mt-7 text-[20px] leading-[1.3]">
                    {c.mood.thought}
                  </figcaption>
                </figure>

                <div>
                  <p className="m-0 text-[12px] uppercase tracking-[0.06em] text-muted">Worth</p>
                  <p style={serif} className="m-0 mt-0.5 text-[40px] leading-none" data-testid="landing-worth">
                    {money(c.value)}
                  </p>
                  <p className="m-0 mt-1.5 text-[14px] text-[#3d3a36]">
                    {c.gain >= 0 ? "+" : "−"}
                    {money(Math.abs(c.gain))} on what went in
                  </p>
                </div>

                <svg
                  viewBox="0 0 300 80"
                  role="img"
                  aria-label={`${c.name} from Jan 2020 to ${m.label}: ${money(c.value)}`}
                  className="block h-auto w-full"
                >
                  <line x1="0" y1="78" x2="300" y2="78" stroke="#e4dcce" strokeWidth="1" />
                  <path d={c.chart.all} fill="none" stroke={c.color} strokeOpacity="0.22" strokeWidth="2" strokeLinejoin="round" />
                  <path d={c.chart.soFar} fill="none" stroke={c.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={c.chart.dotX} cy={c.chart.dotY} r="5" fill={c.color} stroke="#ffffff" strokeWidth="2" />
                </svg>

                <dl className="m-0 grid grid-cols-2 gap-3 border-t border-[#efe8dc] pt-3.5 text-[13px]">
                  <div>
                    <dt className="text-muted">Below its high</dt>
                    <dd className="m-0 mt-0.5 font-semibold">{c.dd === 0 ? "At its high" : `−${Math.abs(c.dd)}%`}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">You'd want to</dt>
                    <dd className="m-0 mt-0.5 font-semibold">{c.mood.urge}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <p className="mt-[18px] text-[12px] leading-[1.5] text-muted">
            A replay of real daily prices from Jan 2, 2020 to Nov 12, 2026: $10,000 at the start and $100 every week into
            each portfolio. These three were picked with hindsight to show the swings. It isn't a prediction or advice.
          </p>
        </section>

        {/* ---- the point ---- */}
        <section id="numbers" aria-labelledby="point-title" className="mt-14 border-t border-rule">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-12 px-6 py-[72px]">
            <div className="min-w-0 flex-[1_1_380px]">
              <h2
                id="point-title"
                style={{ ...serif, fontSize: "clamp(32px, 4vw, 48px)" }}
                className="m-0 font-normal leading-[1.08] tracking-[-0.01em]"
              >
                The ending isn't the hard part. The middle is.
              </h2>
              <p className="mt-5 text-[17px] leading-[1.6] text-[#3d3a36]">
                Everyone wants the line that ends highest. Almost nobody asks what it took to stay on it. Ledger puts the
                biggest fall right next to the result, so you find out what you can actually sit through while the money
                is still pretend.
              </p>
            </div>
            <div className="flex min-w-0 flex-[1_1_520px] flex-wrap gap-4">
              {ENDINGS.map((e) => (
                <div key={e.name} className="min-w-0 flex-[1_1_150px] rounded-[10px] border border-rule bg-surface p-[18px]">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-1 w-4 rounded" style={{ background: e.color }} />
                    <span className="text-[13px] font-semibold">{e.name}</span>
                  </div>
                  <p className="mt-3.5 text-[12px] text-muted">Ended at</p>
                  <p style={serif} className="mt-0.5 text-[28px]">
                    {e.worth}
                  </p>
                  <p className="mt-3 text-[12px] text-muted">Biggest fall on the way</p>
                  <p style={serif} className="mt-0.5 text-[28px] text-loss">
                    {e.drop}
                  </p>
                </div>
              ))}
              <p className="m-0 flex-[1_1_100%] text-[12px] text-muted">
                From $45,800 put into each. Biggest fall is measured with deposits taken out, so weekly top-ups never hide
                a drop.
              </p>
            </div>
          </div>
        </section>

        {/* ---- how it works ---- */}
        <section id="how" aria-labelledby="how-title" className="border-y border-rule bg-surface">
          <div className="mx-auto max-w-[1180px] px-6 py-[72px]">
            <h2 id="how-title" style={{ ...serif, fontSize: "clamp(32px, 4vw, 44px)" }} className="m-0 font-normal">
              How it works
            </h2>
            <ol className="mt-9 flex list-none flex-wrap gap-8 p-0">
              {[
                ["Say what you'd invest", "A starting amount and what you'd add each week. Real numbers, pretend money."],
                [
                  "Pick up to three paths",
                  "The whole US market is filled in for you. Add the fund, the stock, or the mix you've been tempted by.",
                ],
                [
                  "Start today, check in after the close",
                  "Your money goes in at the next market close, at prices nobody knew yet. Then you live with it, week by week, and keep notes on why you changed course.",
                ],
              ].map(([title, body], i) => (
                <li key={title} className="min-w-0 flex-[1_1_280px]">
                  <p style={serif} className="m-0 text-[44px] text-accent">
                    {i + 1}
                  </p>
                  <h3 className="mt-2 text-[18px] font-semibold">{title}</h3>
                  <p className="mt-2 text-[15px] leading-[1.6] text-[#3d3a36]">{body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-[14px] text-muted">
              Curious about the past? Replay any date since 2000. It's clearly marked as a what-if, because you already know
              how it ends.
            </p>
          </div>
        </section>

        {/* ---- honesty strip ---- */}
        <section aria-label="What Ledger is and isn't" className="mx-auto max-w-[1180px] px-6 py-12">
          <ul className="m-0 flex list-none flex-wrap gap-x-10 gap-y-4 p-0 text-[14px] text-[#3d3a36]">
            {[
              "Pretend money only",
              "No brokerage, nothing to link",
              "Real end-of-day prices",
              "No hindsight: choices fill at the next close",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#1f4d3d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3.5 9.5 L7.5 13 L14.5 5" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* ---- final call ---- */}
        <section aria-labelledby="cta-title" className="bg-ink text-paper">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-8 px-6 py-20">
            <div className="min-w-0 flex-[1_1_520px]">
              <h2
                id="cta-title"
                style={{ ...serif, fontSize: "clamp(32px, 4.5vw, 52px)" }}
                className="m-0 font-normal leading-[1.08]"
              >
                Find out what kind of investor you are before it's real money.
              </h2>
              <p className="mt-4 text-[17px] leading-[1.6] text-[#d8d2c6]">It takes about two minutes to set up three paths.</p>
            </div>
            <Link
              to="/start"
              className="inline-flex min-h-12 items-center rounded-md bg-paper px-6 text-[15px] font-semibold text-ink no-underline hover:bg-white"
            >
              Start with pretend money
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-3 px-6 pb-12 pt-8 text-[12px] leading-[1.6] text-muted">
        <p className="m-0 max-w-[720px]">
          Ledger is an educational paper-trading tool. Nothing here is investment advice, and past results don't predict
          future ones. Prices are daily adjusted closes from Tiingo.
        </p>
        <p className="m-0">© Ledger</p>
      </footer>
    </div>
  );
}

function StepButton({ label, onClick, dir }: { label: string; onClick: () => void; dir: "prev" | "next" }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full sm:flex border border-[#d9cfbe] bg-surface text-ink hover:border-ink"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir === "prev" ? "M10 3 L5 8 L10 13" : "M6 3 L11 8 L6 13"} />
      </svg>
    </button>
  );
}
