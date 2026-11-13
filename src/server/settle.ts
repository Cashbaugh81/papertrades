/**
 * Turn a portfolio's pending orders into fills or rejections, using exactly
 * the engine the app uses. The database status is a record of what the
 * engine decides; it never decides anything on its own.
 */
import { computeState } from "@/lib/ledger";
import type { PriceIndex } from "@/lib/prices";
import type { Portfolio } from "@/lib/types";

export type Settlement =
  | {
      id: string;
      status: "filled";
      filled_on: string;
      fill_price: number;
      fill_units: number;
      fill_amount: number;
    }
  | { id: string; status: "filled"; filled_on: string; fill_amount: number }
  | { id: string; status: "rejected"; filled_on: string; reject_reason: string };

/**
 * Decide every order in `pendingIds` that has reached its close. Orders whose
 * close is not in the price data yet are left out, and stay pending.
 */
export function settle(index: PriceIndex, p: Portfolio, pendingIds: Set<string>): Settlement[] {
  const state = computeState(index, p, index.lastDate);
  const out: Settlement[] = [];
  for (const id of pendingIds) {
    const f = state.fills[id];
    const tx = p.tx.find((t) => t.id === id);
    if (f && tx?.kind === "rebalance") {
      // A mix change has no single price: record the day and the money moved.
      out.push({ id, status: "filled", filled_on: f.date, fill_amount: round(f.amount, 2) });
      continue;
    }
    if (f) {
      out.push({
        id,
        status: "filled",
        filled_on: f.date,
        fill_price: round(f.price, 6),
        fill_units: round(f.units, 10),
        fill_amount: round(f.amount, 2),
      });
      continue;
    }
    const r = state.rejections[id];
    if (r) out.push({ id, status: "rejected", filled_on: r.date, reject_reason: r.reason });
  }
  return out;
}

function round(x: number, dp: number): number {
  const k = 10 ** dp;
  return Math.round(x * k) / k;
}
