import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Check, Layers, Repeat, X } from "lucide-react";
import { joinWaitlist } from "@/lib/api";

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
 * The Premium offer a free account sees when it reaches a limit. Nothing is
 * for sale yet: "Join Waitlist" records the waitlist row and upgrades the
 * account to paid on the spot (join_waitlist), free of charge.
 */
export default function UpgradeDialog({
  reason,
  onClose,
  onUpgraded,
}: {
  reason: UpgradeReason | null;
  onClose: () => void;
  /** Called once the account is paid, so the page can lift its limits. */
  onUpgraded?: () => void;
}) {
  const cta = useRef<HTMLButtonElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reason) return;
    setError(null);
    setJoined(false);
  }, [reason]);

  // After upgrading, focus moves to the button that carries on.
  useEffect(() => {
    if (joined) done.current?.focus();
  }, [joined]);

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
      await joinWaitlist(reason!);
      setJoined(true);
      onUpgraded?.();
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
              <>
                <div role="status" className="rounded-sm bg-accent/10 px-3 py-2.5 text-[14px] text-accent" data-testid="waitlist-joined">
                  <span className="flex items-center gap-2 font-medium">
                    <Check size={16} aria-hidden /> Congrats on your subscription
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted">Your account is now Premium. The limits are gone.</span>
                </div>
                <button
                  ref={done}
                  type="button"
                  onClick={onClose}
                  className="mt-3 min-h-11 w-full rounded-sm bg-accent px-4 text-[15px] font-semibold text-paper hover:bg-[#163a2e]"
                >
                  Continue
                </button>
              </>
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
            <p className="mt-3 text-[12px] text-muted">Free during early access. You won't be charged.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
