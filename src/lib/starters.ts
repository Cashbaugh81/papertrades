/**
 * The three starter portfolios: the same dollars, three different convictions.
 *
 * As examples they are seeded about three years back with real market history,
 * so the first visit shows paths that have already diverged. They are stored
 * with `example = true` and labelled as market fact, not the user's decisions.
 * "Start fresh today" replaces them with the same three as real portfolios
 * whose buys are orders that fill at the next close.
 */
export type Starter = {
  name: string;
  thesis: string;
  initial: number;
  monthly: number;
  weights: Record<string, number>;
  buys: { ticker: string; amount: number }[];
};

export const STARTERS: Starter[] = [
  {
    name: "Boring index mix",
    thesis: "Own the whole market and do nothing. The baseline every other path is measured against.",
    initial: 10_000,
    monthly: 500,
    weights: { VTI: 0.6, BND: 0.4 },
    buys: [
      { ticker: "VTI", amount: 6000 },
      { ticker: "BND", amount: 4000 },
    ],
  },
  {
    name: "Chip-heavy",
    thesis: "Concentrated in semiconductors because the growth story feels obvious right now.",
    initial: 10_000,
    monthly: 500,
    weights: { SMH: 0.5, NVDA: 0.5 },
    buys: [
      { ticker: "SMH", amount: 5000 },
      { ticker: "NVDA", amount: 5000 },
    ],
  },
  {
    name: "Healthcare",
    thesis: "Defensive and dull on purpose: people get sick in every kind of market.",
    initial: 10_000,
    monthly: 500,
    weights: { XLV: 0.6, LLY: 0.4 },
    buys: [
      { ticker: "XLV", amount: 6000 },
      { ticker: "LLY", amount: 4000 },
    ],
  },
];

export const STARTER_TICKERS = [...new Set(STARTERS.flatMap((s) => Object.keys(s.weights)))].sort();

/** About three years before `today` (YYYY-MM-DD), for the example portfolios. */
export function exampleStart(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 3);
  return d.toISOString().slice(0, 10);
}
