import { useEffect, useMemo, useState } from "react";
import { availableRanges, RANGE_KEYS, RANGE_NAMES, rangeStart, type RangeKey } from "@/lib/ranges";

/**
 * The chart's time range, for data running from `first` to `last`. Starts on
 * All; if the picked range stops being available (other data), goes back to All.
 */
export function useRange(first?: string, last?: string) {
  const [key, setKey] = useState<RangeKey>("All");
  const available = useMemo(
    () => (first && last ? availableRanges(first, last) : new Set<RangeKey>(["All"])),
    [first, last],
  );
  useEffect(() => {
    if (!available.has(key)) setKey("All");
  }, [available, key]);
  const from = last ? rangeStart(key, last) : undefined;
  return { key, setKey, available, from };
}

/** 1W 1M 3M 6M YTD 1Y 2Y 5Y 10Y All. Ranges longer than the history are greyed out. */
export default function RangeBar({
  value,
  onChange,
  available,
  testId,
}: {
  value: RangeKey;
  onChange: (k: RangeKey) => void;
  available: Set<RangeKey>;
  testId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className="-mx-1 flex gap-0.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
      data-testid={testId}
    >
      {RANGE_KEYS.map((k) => {
        const on = k === value;
        const ok = available.has(k);
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={!ok}
            aria-label={RANGE_NAMES[k]}
            title={ok ? RANGE_NAMES[k] : `${RANGE_NAMES[k]}: not enough history yet`}
            onClick={() => ok && onChange(k)}
            data-range={k}
            className={`num shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              on
                ? "bg-ink text-surface"
                : ok
                  ? "text-ink hover:bg-ink/5"
                  : "cursor-not-allowed text-ink/25"
            }`}
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}
