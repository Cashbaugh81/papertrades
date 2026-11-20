import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

export const MAX_NAME = 40;

/** The fund portfolio 1 starts as (and is locked to on a free account). */
export const BASELINE_FUND = "VTI";
/** Portfolio 1's default name while it holds only the baseline fund. */
export const BASELINE_NAME = "Baseline Market ETF";

/** True for a mix that is the baseline fund and nothing else. */
export function isBaselineMix(mix?: Record<string, number> | null): boolean {
  if (!mix) return false;
  const keys = Object.keys(mix);
  return keys.length === 1 && keys[0] === BASELINE_FUND && Math.abs(mix[BASELINE_FUND] - 1) < 1e-9;
}

/** The name a portfolio has when nobody has named it. */
export function defaultName(slot: number, mix?: Record<string, number> | null): string {
  return slot === 1 && isBaselineMix(mix) ? BASELINE_NAME : `Portfolio ${slot}`;
}

/**
 * What a portfolio is called: its chosen name, or else "Baseline Market ETF"
 * for portfolio 1 while it's all VTI, or "Portfolio N".
 */
export function portfolioName(slot: number, customName?: string | null, mix?: Record<string, number> | null): string {
  return customName?.trim() || defaultName(slot, mix);
}

/**
 * A portfolio's name with a pencil to rename it in place. Enter or leaving the
 * box saves; Escape cancels; saving an empty box goes back to the default name.
 */
export default function PortfolioName({
  slot,
  customName,
  mix,
  onSave,
  testId,
  className = "",
}: {
  slot: number;
  customName?: string | null;
  /** The portfolio's mix, which decides the default name (see defaultName). */
  mix?: Record<string, number> | null;
  /** Save the new name ("" = back to the default). May throw. */
  onSave: (name: string) => void | Promise<void>;
  testId: string;
  className?: string;
}) {
  const shown = portfolioName(slot, customName, mix);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const done = useRef(false); // Enter and the blur that follows it shouldn't both save

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  async function save() {
    if (done.current) return;
    done.current = true;
    const next = draft.trim().slice(0, MAX_NAME);
    if (next === (customName ?? "").trim()) return close();
    setBusy(true);
    try {
      await onSave(next);
      close();
    } catch (e) {
      done.current = false;
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }
  function close() {
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => pencil.current?.focus());
  }

  if (editing) {
    return (
      <span className="flex min-w-0 flex-1 flex-col">
        <input
          ref={input}
          value={draft}
          maxLength={MAX_NAME}
          disabled={busy}
          placeholder={defaultName(slot, mix)}
          aria-label={`Name for portfolio ${slot}`}
          data-testid={`${testId}-input`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              done.current = true;
              close();
            }
          }}
          className={`-my-1 w-full min-w-0 rounded-sm border border-accent bg-surface px-1.5 py-0.5 ${className}`}
        />
        {error && <span className="mt-1 text-[11px] text-loss">{error}</span>}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className={`truncate ${className}`} title={shown} data-testid={testId}>
        {shown}
      </span>
      <button
        ref={pencil}
        type="button"
        onClick={() => {
          done.current = false;
          setDraft(customName ?? "");
          setEditing(true);
        }}
        aria-label={`Rename ${shown}`}
        title="Rename"
        data-testid={`${testId}-rename`}
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted/70 hover:bg-paper hover:text-ink"
      >
        <Pencil size={12} aria-hidden />
      </button>
    </span>
  );
}
