import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { loadSettings, saveSettings } from "@/lib/api";
import { CATEGORY_COLORS, LESSONS, type LessonCategory } from "@/lib/lessons";

/**
 * Bite-size lessons for newer investors, one card at a time. "Got it" moves on.
 * "Hide" collapses the section to its header; both the choice and the card
 * someone is on are saved to their account, so they hold on every sign-in.
 */
export default function LessonCards() {
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1 | 0>(0);

  useEffect(() => {
    let live = true;
    loadSettings()
      .then((s) => {
        if (!live) return;
        setHidden(s.lessonsHidden);
        setIndex(Math.min(Math.max(s.lessonIndex, 0), LESSONS.length));
      })
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  if (!loaded) return null;

  const save = (patch: Parameters<typeof saveSettings>[0]) => saveSettings(patch).catch(() => {});
  const toggle = () => {
    setHidden(!hidden);
    save({ lessonsHidden: !hidden });
  };
  const go = (to: number) => {
    if (to < 0 || to > LESSONS.length || to === index) return;
    setDir(to > index ? 1 : -1);
    setIndex(to);
    save({ lessonIndex: to });
  };
  const done = index >= LESSONS.length;

  return (
    <section aria-labelledby="lessons-title" data-testid="lessons">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="lessons-title" className="flex items-baseline gap-2 text-[15px] font-medium">
          Investing basics
          {!hidden && (
            <span className="micro" data-testid="lesson-count">
              {done ? `${LESSONS.length} of ${LESSONS.length}` : `${index + 1} of ${LESSONS.length}`}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!hidden}
          aria-controls="lessons-body"
          data-testid="lessons-toggle"
          className="flex items-center gap-1.5 rounded-sm border border-rule px-3 py-1.5 text-[12px] text-muted hover:border-ink/30 hover:text-ink"
        >
          {hidden ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
          {hidden ? "Show" : "Hide"}
        </button>
      </div>

      {!hidden && (
        <div id="lessons-body">
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-rule" aria-hidden>
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(index / LESSONS.length) * 100}%` }} />
          </div>
          {done ? <Finished onPick={go} /> : <Card key={index} index={index} dir={dir} onGotIt={() => go(index + 1)} onBack={() => go(index - 1)} />}
        </div>
      )}
    </section>
  );
}

function Card({ index, dir, onGotIt, onBack }: { index: number; dir: 1 | -1 | 0; onGotIt: () => void; onBack: () => void }) {
  const l = LESSONS[index];
  const color = CATEGORY_COLORS[l.category];
  return (
    <article
      aria-live="polite"
      data-testid="lesson-card"
      className={`grid overflow-hidden rounded-sm border border-rule bg-surface sm:grid-cols-[180px_minmax(0,1fr)] ${dir > 0 ? "lesson-in-r" : dir < 0 ? "lesson-in-l" : ""}`}
    >
      <div className="flex items-end justify-between gap-3 px-5 py-4 text-white sm:flex-col sm:items-start sm:py-5" style={{ background: color }}>
        <div className="text-[12px] font-medium leading-snug sm:order-none">{l.category}</div>
        <div className="figure text-[44px] leading-none sm:text-[64px]">
          {index + 1}
          <span className="ml-1 font-sans text-[12px] opacity-85 sm:ml-0 sm:mt-2 sm:block">of {LESSONS.length}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-5 py-5 sm:px-7">
        <h3 className="figure text-[24px] leading-tight">{l.title}</h3>
        <p className="max-w-[62ch] text-[15px]">{l.body}</p>
        <p className="rounded-r-sm border-l-2 bg-paper px-3 py-2 text-[14px] text-muted" style={{ borderColor: color }}>
          <span className="font-medium text-ink">Example: </span>
          {l.example}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onBack}
            disabled={index === 0}
            className="min-h-11 rounded-sm px-2 text-[13px] text-muted hover:text-ink disabled:cursor-default disabled:opacity-35"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onGotIt}
            data-testid="lesson-got-it"
            className="min-h-11 rounded-sm bg-accent px-6 text-[14px] font-medium text-white hover:brightness-110 max-sm:flex-1"
          >
            Got it
          </button>
        </div>
      </div>
    </article>
  );
}

function Finished({ onPick }: { onPick: (index: number) => void }) {
  const cats = Object.keys(CATEGORY_COLORS) as LessonCategory[];
  return (
    <div className="lesson-in-r flex flex-col items-center gap-3 rounded-sm border border-rule bg-surface px-6 py-8 text-center" data-testid="lessons-done">
      <h3 className="figure text-[24px]">All {LESSONS.length} lessons done</h3>
      <p className="text-[14px] text-muted">Revisit a topic, or start again from the top.</p>
      <div className="flex flex-wrap justify-center gap-2">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(LESSONS.findIndex((l) => l.category === c))}
            className="flex min-h-9 items-center gap-2 rounded-full border border-rule px-3 text-[13px] hover:border-ink/30"
          >
            <span className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[c] }} aria-hidden />
            {c}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onPick(0)} className="mt-1 min-h-11 rounded-sm bg-accent px-6 text-[14px] font-medium text-white hover:brightness-110">
        Start over
      </button>
    </div>
  );
}
