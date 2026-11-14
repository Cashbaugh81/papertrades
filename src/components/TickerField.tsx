import { useEffect, useRef, useState } from "react";
import { searchTickers, type SearchHit } from "@/lib/api";

const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

type Props = {
  /** The ticker this row holds ("" while none is chosen). */
  value: string;
  /** Set (or clear) the row's ticker. */
  onCommit: (ticker: string) => void;
  /** True while a search is running, so the row can say "checking…". */
  onPending: (pending: boolean) => void;
  label: string;
  testId: string;
};

/**
 * A ticker box that also searches by name: type "netflix" and pick NFLX.
 * The row only takes a ticker when one is picked, when what was typed is
 * exactly a ticker the search found, or (if the search finds nothing or
 * fails) when what was typed looks like a ticker and the box is left.
 */
export default function TickerField({ value, onCommit, onPending, label, testId }: Props) {
  const [text, setText] = useState(value);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0);
  const listId = `${testId}-results`;

  // Follow changes made outside this box (rows reset or removed).
  useEffect(() => {
    if (value && value !== text.trim().toUpperCase()) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Search after a short pause in typing.
  useEffect(() => {
    const q = text.trim();
    const upper = q.toUpperCase();
    if (q.length < 2 || upper === value) {
      setHits([]);
      onPending(false);
      return;
    }
    const n = ++latest.current;
    onPending(true);
    const timer = window.setTimeout(async () => {
      const found = await searchTickers(q).catch(() => [] as SearchHit[]);
      if (n !== latest.current) return; // a newer search is on its way
      setHits(found);
      setActive(0);
      onPending(false);
      const exact = found.find((h) => h.ticker === upper);
      if (exact) onCommit(exact.ticker);
      else if (found.length === 0 && TICKER_RE.test(upper)) onCommit(upper); // let the price lookup decide
      else setOpen(true);
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function pick(h: SearchHit) {
    latest.current++;
    setText(h.ticker);
    setHits([]);
    setOpen(false);
    onPending(false);
    onCommit(h.ticker);
  }

  function leave() {
    setOpen(false);
    const upper = text.trim().toUpperCase();
    if (!upper) return onCommit("");
    if (upper !== value && TICKER_RE.test(upper)) onCommit(upper);
  }

  const showList = open && hits.length > 0;

  return (
    <div className="relative min-w-0 flex-1">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        data-testid={testId}
        value={text}
        placeholder="Ticker or name, e.g. Netflix"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const upper = t.trim().toUpperCase();
          if (upper !== value) onCommit(""); // what's typed isn't a chosen ticker yet
          // Say "checking…" straight away, not after the search's pause, so a
          // quick click on Save can't slip in before the ticker is set.
          onPending(upper.length >= 2 && upper !== value);
        }}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={leave}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-sm border border-rule bg-surface px-2.5 py-2 text-sm placeholder:text-muted/70"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Matches for ${text}`}
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-[min(22rem,calc(100vw-3rem))] overflow-auto rounded-sm border border-rule bg-surface py-1 text-sm shadow-md"
        >
          {hits.map((h, i) => (
            <li
              key={h.ticker}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-testid={`${testId}-hit-${h.ticker}`}
              // mousedown, so the pick lands before the box loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-10 cursor-pointer items-baseline gap-2.5 px-3 py-1.5 ${i === active ? "bg-paper" : ""}`}
            >
              <span className="w-14 shrink-0 font-semibold">{h.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{h.name}</span>
              {h.assetType && <span className="shrink-0 text-[11px] text-muted">{h.assetType}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
