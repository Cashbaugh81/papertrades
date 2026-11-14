import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Check, Layers, Repeat, X } from "lucide-react";
import { joinWaitlist, waitlistJoinedAt } from "@/lib/api";

export type UpgradeReason = "portfolios" | "tickers";

const BASE = import.meta.env.BASE_URL;

/** Why the window opened, in one line above the offer. */
const LEAD: Record<UpgradeReason, string> = {
  portfolios: "Free accounts compare up to 3 portfolios.",
  tickers: "Free portfolios hold up to 3 stocks or funds each.",
};

const FEATURES = [
  { icon: Layers, text: "Up to 10 portfolios tracked at once" },
  { icon: BarChart3, text: "Unlimited stock tickers per portfolio" },
  { icon: Repeat, text: "Buy and sell order tracking, to make portfolios more lifelike" },
];

/**
 * The paid-tier offer a free account sees when it reaches a limit. The paid
 * tier isn't for sale yet, so the button joins a waitlist (public.waitlist).
 */
export default function UpgradeDialog({ reason, onClose }: { reason: UpgradeReason | null; onClose: () => void }) {
  const cta = useRef<HTMLButtonElement>(null);
  const [joined, setJoined] = useState<string | null | undefined>(undefined); // undefined = checking
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already on the list? Asked each time the window opens.
  useEffect(() => {
    if (!reason) return;
    setError(null);
    waitlistJoinedAt()
      .then(setJoined)
      .catch(() => setJoined(null));
  }, [reason]);

  useEffect(() => {
    if (!reason) return;
    const back = document.activeElement as HTMLElement | null;
    cta.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      back?.focus?.();
    };
  }, [reason, onClose]);

  if (!reason) return null;

  async function join() {
    setBusy(true);
    setError(null);
    try {
      setJoined(await joinWaitlist(reason!));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Rendered on <body>, so no styled ancestor can confine the overlay.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        aria-describedby="upgrade-lead"
        data-testid="upgrade-dialog"
        className="relative grid w-full max-w-[680px] overflow-hidden rounded-md bg-surface shadow-xl sm:h-[460px] sm:grid-cols-[minmax(0,38%)_1fr]"
      >
        {/* The art: a full-height column on wider screens, a short strip on phones. */}
        <div className="relative h-36 sm:h-auto">
          <img
            src={`${BASE}upgrade-320.webp`}
            srcSet={`${BASE}upgrade-320.webp 320w, ${BASE}upgrade-640.webp 640w`}
            sizes="(min-width: 640px) 260px, 100vw"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[50%_18%] sm:object-[50%_0%]"
          />
        </div>

        <div className="flex flex-col p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-sm bg-surface/80 text-muted hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>

          <p id="upgrade-lead" className="text-[13px] text-muted">
            {LEAD[reason]}
          </p>
          <h2 id="upgrade-title" className="figure mt-1 text-[26px] leading-tight">
            Upgrade to Premium
          </h2>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="figure text-[34px] leading-none">$2.99</span>
            <span className="text-[14px] text-muted">/ month</span>
          </p>

          <ul className="mt-5 space-y-3 text-[14px]">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm bg-accent/10 text-accent">
                  <Icon size={14} aria-hidden />
                </span>
                <span className="leading-snug">{text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 sm:mt-auto sm:pt-6">
            {joined ? (
              <div role="status" className="rounded-sm bg-accent/10 px-3 py-2.5 text-[14px] text-accent" data-testid="waitlist-joined">
                <span className="flex items-center gap-2 font-medium">
                  <Check size={16} aria-hidden /> You're on the waitlist
                </span>
                <span className="mt-0.5 block text-[12px] text-muted">We'll let you know when Premium opens.</span>
              </div>
            ) : (
              <button
                ref={cta}
                type="button"
                onClick={join}
                disabled={busy}
                className="min-h-11 w-full rounded-sm bg-accent px-4 text-[15px] font-semibold text-paper hover:bg-[#163a2e] disabled:opacity-60"
              >
                {busy ? "Joining…" : "Join Waitlist"}
              </button>
            )}
            {error && <p className="mt-2 text-[12px] text-loss">{error}</p>}
            <p className="mt-3 text-[12px] text-muted">Premium isn't available yet. Joining is free and you won't be charged.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
