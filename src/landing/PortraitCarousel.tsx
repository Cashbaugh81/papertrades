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
 * sideways and move on by themselves every 3 seconds. A swipe restarts the
 * wait. No dots or pause button, at Chris's request: they're marketing
 * images with nothing to read closely. People who ask their system for less
 * motion get a still carousel they can swipe.
 */
export default function PortraitCarousel({ className = "" }: { className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const playing = !prefersReducedMotion();

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  // Follow swipes, so the next automatic move starts from where they left it.
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
    </section>
  );
}
