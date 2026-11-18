import { useCallback, useEffect, useRef, useState } from "react";

const serif = { fontFamily: "Newsreader, Georgia, serif" } as const;

/**
 * Example use cases, written as quotes. These are illustrative personas, not
 * reviews from real customers, and the section says so. Swap in real quotes
 * (with permission) as they come in.
 */
const CARDS: { who: string; detail: string; color: string; quote: string }[] = [
  {
    who: "First-time investor",
    detail: "23, just started a first job",
    color: "#1D4ED8",
    quote:
      "I was honestly too nervous to put real money into anything. Here I picked the stocks I actually liked and watched how they changed day to day. After a few months the ups and downs stopped scaring me.",
  },
  {
    who: "Mom of two",
    detail: "44, saving for college",
    color: "#B8860B",
    quote:
      "I want to start investing for my kids' college funds, but I didn't know how much risk I could live with. I put the boring, safe picks right next to a few exciting stocks with the same money. Seeing both paths side by side made the decision so much easier.",
  },
  {
    who: "Recovering risk-taker",
    detail: "31, likes a big swing",
    color: "#C8102E",
    quote:
      "I still get the itch to make wild, risky bets. Now I make them here and see exactly how they would have played out. It scratches the itch without touching my rent money.",
  },
  {
    who: "Retiree",
    detail: "67, curious about the road not taken",
    color: "#0369A1",
    quote:
      "I always wondered whether dividend stocks would have beaten my target-date fund. I started both ten years back with the same deposits and finally got a real answer. No sales pitch required.",
  },
  {
    who: "Economics teacher",
    detail: "38, high school",
    color: "#008300",
    quote:
      "Each student builds a pretend portfolio on the first day and we check them every Friday. Watching their favourite picks fall in a bad week teaches more about risk than any chapter could.",
  },
  {
    who: "Settling a debate",
    detail: "36, married to an optimist",
    color: "#9333EA",
    quote:
      "My husband swore his tech stocks would beat our plain index fund. We each set up a portfolio with the same money and let the market decide. I'm ahead right now, and he hears about it every week.",
  },
];

/**
 * A row of tall quote cards: three in view on wide screens, two on tablets,
 * one on phones. Arrows on either end move one card at a time; the row also
 * scrolls and swipes natively, snapping to cards.
 */
export default function WhoItsFor() {
  const track = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const step = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const by = card ? card.getBoundingClientRect().width + gap : el.clientWidth;
    // Aim for an exact card, so quick repeated clicks never stop between two cards.
    const target = (Math.round(el.scrollLeft / by) + dir) * by;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: target, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section aria-labelledby="who-title" className="mx-auto max-w-[1180px] px-6 pt-[72px]">
      <p className="m-0 mb-3 text-[13px] uppercase tracking-[0.08em] text-muted">Who it's for</p>
      <h2 id="who-title" style={{ ...serif, fontSize: "clamp(32px, 4vw, 44px)" }} className="m-0 font-normal">
        Same tool, very different reasons
      </h2>

      <div className="mt-9 flex items-center gap-2 sm:gap-4">
        <Arrow dir="prev" disabled={atStart} onClick={() => step(-1)} />
        <ul
          ref={track}
          onScroll={update}
          aria-label="Example ways people use it"
          tabIndex={0}
          className="no-scrollbar m-0 flex min-w-0 flex-1 snap-x snap-mandatory list-none gap-5 overflow-x-auto p-0 focus-visible:outline-offset-4"
          style={{ scrollbarWidth: "none" }}
        >
          {CARDS.map((c, i) => (
            <li
              key={c.who}
              aria-label={`${i + 1} of ${CARDS.length}`}
              className="flex min-h-[380px] shrink-0 basis-full snap-start flex-col rounded-[10px] border border-rule bg-surface p-5 sm:p-7 sm:basis-[calc((100%-20px)/2)] lg:basis-[calc((100%-40px)/3)]"
            >
              <span aria-hidden style={{ ...serif, color: c.color }} className="block h-10 text-[64px] leading-[0.9]">
                “
              </span>
              <blockquote style={serif} className="m-0 mt-4 flex-1 text-[18px] leading-[1.45] text-ink sm:text-[20px]">
                {c.quote}
              </blockquote>
              <footer className="mt-6 flex items-center gap-3 border-t border-[#efe8dc] pt-4">
                <span aria-hidden className="h-1 w-[22px] shrink-0 rounded" style={{ background: c.color }} />
                <div className="min-w-0">
                  <p className="m-0 text-[15px] font-semibold">{c.who}</p>
                  <p className="m-0 mt-0.5 text-[13px] text-muted">{c.detail}</p>
                </div>
              </footer>
            </li>
          ))}
        </ul>
        <Arrow dir="next" disabled={atEnd} onClick={() => step(1)} />
      </div>

      <p className="mt-[18px] text-[12px] leading-[1.5] text-muted">
        Illustrative examples of how people can use Ledger, not reviews from real customers.
      </p>
    </section>
  );
}

function Arrow({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={dir === "prev" ? "Previous examples" : "Next examples"}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 shrink-0 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-[#d9cfbe] bg-surface text-ink hover:border-ink disabled:cursor-default disabled:opacity-35 disabled:hover:border-[#d9cfbe]"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir === "prev" ? "M10 3 L5 8 L10 13" : "M6 3 L11 8 L6 13"} />
      </svg>
    </button>
  );
}
