import { Link } from "react-router-dom";
import PortraitCarousel from "@/landing/PortraitCarousel";
import WhoItsFor from "@/landing/WhoItsFor";
import WhatIfStories from "@/landing/WhatIfStories";
import { ENDINGS } from "@/landing/data";

const BASE = import.meta.env.BASE_URL;
const serif = { fontFamily: "Newsreader, Georgia, serif" } as const;
const sans = { fontFamily: "Inter, system-ui, sans-serif" } as const;

/**
 * Landing page 2, at /lp2: the main landing page (/) with its replay section
 * swapped for four "what if you'd bought…" stories (WhatIfStories). Everything
 * else is meant to match the main page; change both when editing shared parts.
 */
export default function LandingPage2() {
  return (
    <div style={sans} className="min-h-screen bg-paper text-ink">
      {/* ---- nav ---- */}
      <header className="border-b border-rule">
        <nav aria-label="Main" className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-6 py-[18px]">
          <Link to="/lp2" className="flex items-baseline gap-2.5 text-ink no-underline">
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
              // One line at every width: the title is about 11.3 times as wide as
              // its font size, so size it from the column width (12 leaves room
              // for the fallback font), capped at 72px.
              style={{ ...serif, fontSize: "min(72px, calc((min(100vw, 1180px) - 48px) / 12))" }}
              className="m-0 whitespace-nowrap font-normal leading-[1.02] tracking-[-0.02em]"
            >
              Test your stock skills for free.
            </h1>
          </div>

          {/* Full-width banner. Its painted button isn't real, so the whole image links to sign-up. */}
          <Link
            to="/start"
            aria-label="Learn. Practice. Invest smarter. Start with pretend money"
            className="mx-auto mt-10 hidden max-w-[2172px] sm:block"
            data-testid="landing-banner"
          >
            <img
              src={`${BASE}landing/banner-cropped-1280.webp`}
              srcSet={`${BASE}landing/banner-cropped-1280.webp 1280w, ${BASE}landing/banner-cropped-2172.webp 2172w`}
              sizes="100vw"
              loading="lazy"
              width={2172}
              height={682}
              alt=""
              className="block h-auto w-full"
            />
          </Link>

          {/* On phones the wide banner is too small to read, so show the portraits one at a time. */}
          <PortraitCarousel className="mt-8 sm:hidden" />

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

        {/* ---- what $10,000 could have become (replaces the main page's replay) ---- */}
        <div>
          <div className="mx-auto max-w-[1180px] px-6 pb-8">
            <h2 id="whatif-heading" style={{ ...serif, fontSize: "clamp(32px, 4vw, 44px)" }} className="m-0 font-normal">
              What if I had…
            </h2>
          </div>
          <WhatIfStories labelledBy="whatif-heading" />
        </div>

        <section id="numbers" aria-labelledby="point-title" className="mt-14 border-t border-rule">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-12 px-6 py-[72px]">
            <div className="min-w-0 flex-[1_1_380px]">
              <h2
                id="point-title"
                style={{ ...serif, fontSize: "clamp(32px, 4vw, 48px)" }}
                className="m-0 font-normal leading-[1.08] tracking-[-0.01em]"
              >
                Don't waste real money learning about the market.
              </h2>
              <p className="mt-5 text-[17px] leading-[1.6] text-[#3d3a36]">
                We all want the biggest return for our investments, but sometimes we wonder if we are making the right
                choices. Now you can test multiple stock buys against each other. Invest the same $500 into different
                stocks and see which one performs best.
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
                ["Tell us your investment amounts", "A starting amount and what you'd add each week. Real numbers, pretend money."],
                [
                  "Pick multiple investment portfolios for the same money",
                  "The whole market is filled in for you. Add the fund, the stock, or the mix you've been tempted by.",
                ],
                [
                  "Start with today or go back in time",
                  "Start your portfolios today or move back in time and see where you'd be if you had invested years ago. Stocks get updated every trading day after close.",
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

        {/* ---- who it's for: example use cases ---- */}
        <WhoItsFor />

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
