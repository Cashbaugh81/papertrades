/**
 * Card tints that rank portfolios by return: the best is the greenest, the
 * worst the reddest, the middle neutral. Ranks are relative (Chris, 14 Nov):
 * with three winners, the smallest winner is still the reddest card. Each card
 * also says its rank in words, so colour is never the only signal.
 *
 * Strength is capped so text stays readable: at 12% the muted grey label text
 * keeps 4.5:1 contrast on the tint (checked for both hues). Borders don't hold
 * text, so they carry a stronger version of the colour to separate close shades.
 */

export type RankTint = {
  /** 1 = best. Ties share a rank (1, 1, 3). */
  rank: number;
  of: number;
  /** −1 (worst, red) … 0 (neutral) … +1 (best, green). */
  t: number;
};

const SURFACE = "#ffffff";
const RULE = "#e4dcce";
const GREEN = "#1b6b4a"; // --color-gain
const RED = "#a03a28"; // --color-loss
const MAX_FILL = 0.12;
const MAX_BORDER = 0.5;

export function rankTints(entries: { key: number; value: number }[]): Map<number, RankTint> {
  const out = new Map<number, RankTint>();
  const n = entries.length;
  if (n < 2) return out;
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && Math.abs(sorted[j + 1].value - sorted[i].value) < 1e-9) j++;
    const position = (i + j) / 2; // ties share the average position
    const t = 1 - (2 * position) / (n - 1);
    for (let k = i; k <= j; k++) out.set(sorted[k].key, { rank: i + 1, of: n, t });
    i = j + 1;
  }
  return out;
}

function mix(a: string, b: string, amount: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((x, k) => Math.round(x + (pb[k] - x) * amount).toString(16).padStart(2, "0")).join("")}`;
}

/** Background and border for a card at tint `t` (−1 … +1). */
export function tintColors(t: number): { background: string; borderColor: string } {
  const hue = t >= 0 ? GREEN : RED;
  const s = Math.min(1, Math.abs(t));
  return { background: mix(SURFACE, hue, s * MAX_FILL), borderColor: mix(RULE, hue, s * MAX_BORDER) };
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
