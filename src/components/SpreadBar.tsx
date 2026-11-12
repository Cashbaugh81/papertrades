type Props = {
  /** This portfolio's spread against the baseline, as a fraction (0.12 = +12pp). */
  spread: number;
  /** Largest absolute spread in the table, so bars are comparable across rows. */
  scale: number;
};

/**
 * Signature element: distance from the baseline, drawn from a centre line.
 * Direction reads before the number does, which is the point - most of the time
 * the honest answer is "you are a little below the boring thing".
 */
export default function SpreadBar({ spread, scale }: Props) {
  const norm = scale > 0 ? Math.min(1, Math.abs(spread) / scale) : 0;
  const width = norm * 50;
  const positive = spread >= 0;
  const tint = positive ? "var(--color-gain)" : "var(--color-loss)";

  return (
    <div className="relative h-3 w-full min-w-16" aria-hidden="true">
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-rule" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-[width] duration-500"
        style={{
          width: `${width}%`,
          background: tint,
          opacity: 0.85,
          left: positive ? "50%" : undefined,
          right: positive ? undefined : "50%",
        }}
      />
    </div>
  );
}
