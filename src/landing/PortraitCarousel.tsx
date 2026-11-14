import { useCallback, useEffect, useRef, useState } from "react";

const BASE = import.meta.env.BASE_URL;

const SLIDES = [
  { src: "slide-learn.webp", label: "Learn", alt: "Learn: a student cheering at her phone outside campus" },
  { src: "slide-practice.webp", label: "Practice", alt: "Practice: a young man smiling behind his laptop" },
  { src: "slide-invest.webp", label: "Invest smarter", alt: "Invest smarter: a mother with her baby, smiling at her phone" },
];

/** How long each portrait stays before the carousel moves on. */
const STEP_MS = 3000;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Phone-only stand-in for the wide banner: three portraits that swipe
 * sideways and move on by themselves every 3 seconds. A swipe or a dot
 * restarts the wait.
 */
export default function PortraitCarousel({ className = "" }: { className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  // Keep the dots in step with swipes.
  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== at) setAt(i);
  };

  // Move on every 3 seconds; any change of slide (auto or by hand) restarts the wait.
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => go((at + 1) % SLIDES.length), STEP_MS);
    return () => window.clearTimeout(t);
  }, [at, playing, go]);

  return (
    <section aria-roledescription="carousel" aria-label="Learn, practice, invest smarter" className={className}>
      <div
        ref={track}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="portrait-carousel"
      >
        {SLIDES.map((s, i) => (
          <div
            key={s.src}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}: ${s.label}`}
            className="w-full shrink-0 snap-start"
          >
            <img
              src={`${BASE}landing/${s.src}`}
              alt={s.alt}
              width={750}
              height={888}
              loading="lazy"
              className="block h-auto w-full"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-1">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show ${s.label}`}
            aria-current={i === at}
            className="flex h-11 w-8 items-center justify-center"
          >
            <span className={`block h-2 rounded-full transition-all ${i === at ? "w-5 bg-ink" : "w-2 bg-[#cfc6b6]"}`} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause the slideshow" : "Play the slideshow"}
          data-testid="carousel-play"
          className="ml-1 flex h-11 w-11 items-center justify-center text-muted"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
            {playing ? <path d="M3 2h3v10H3zM8 2h3v10H8z" /> : <path d="M3.5 1.8v10.4L12 7z" />}
          </svg>
        </button>
      </div>
    </section>
  );
}
