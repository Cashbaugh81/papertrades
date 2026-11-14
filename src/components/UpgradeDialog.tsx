import { useEffect, useRef } from "react";
import { Lock } from "lucide-react";

export type UpgradeReason = "portfolios" | "tickers";

const COPY: Record<UpgradeReason, { title: string; body: string }> = {
  portfolios: {
    title: "Add more portfolios with a paid account",
    body: "Free accounts compare up to 3 portfolios. A paid account lets you compare up to 10 side by side.",
  },
  tickers: {
    title: "Hold more tickers with a paid account",
    body: "Free portfolios hold up to 3 stocks or funds each. A paid account lets each portfolio hold up to 8.",
  },
};

/** The message a free account sees when it reaches a paid feature. */
export default function UpgradeDialog({ reason, onClose }: { reason: UpgradeReason | null; onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!reason) return;
    const back = document.activeElement as HTMLElement | null;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      back?.focus?.();
    };
  }, [reason, onClose]);

  if (!reason) return null;
  const { title, body } = COPY[reason];
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-5"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        aria-describedby="upgrade-body"
        data-testid="upgrade-dialog"
        className="w-full max-w-sm rounded-md border border-rule bg-surface p-5 shadow-lg"
      >
        <div className="flex items-center gap-2 text-accent">
          <Lock size={16} aria-hidden />
          <span className="micro text-accent">Paid feature</span>
        </div>
        <h2 id="upgrade-title" className="figure mt-2 text-[22px] leading-tight">
          {title}
        </h2>
        <p id="upgrade-body" className="mt-2 text-[14px] leading-relaxed text-muted">
          {body}
        </p>
        <p className="mt-3 text-[12px] text-muted">Paid accounts aren't available to buy yet.</p>
        <div className="mt-5 flex justify-end">
          <button
            ref={button}
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-sm bg-accent px-4 text-[14px] font-medium text-paper"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
