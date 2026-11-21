import { useState } from "react";

/** A labelled figure, with an optional callout explaining the label (hover, focus or tap). */
export default function Stat({
  label,
  value,
  tone,
  hint,
  hintAlign = "left",
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss";
  hint?: string;
  /** Which edge the callout lines up with; "right" for labels in the right-hand column. */
  hintAlign?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <dt className="text-muted">
        {hint ? (
          // Explained in a callout on hover, focus or tap.
          <span className="relative inline-block">
            <button
              type="button"
              className="cursor-help underline decoration-dotted decoration-[#b9b0a1] underline-offset-[3px] hover:text-ink"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onClick={() => setOpen(true)} // a tap also fires hover, so only open; tapping elsewhere closes it
              aria-expanded={open}
              aria-describedby={open ? `hint-${label}` : undefined}
            >
              {label}
            </button>
            {open && (
              <span
                id={`hint-${label}`}
                role="tooltip"
                className={`absolute bottom-full ${hintAlign === "right" ? "right-0" : "left-0"} z-20 mb-1.5 block w-56 max-w-[calc(100vw-3rem)] rounded-sm border border-rule bg-surface p-2.5 text-[12px] leading-snug text-ink shadow-sm`}
              >
                {hint}
              </span>
            )}
          </span>
        ) : (
          label
        )}
      </dt>
      <dd className={`num ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
