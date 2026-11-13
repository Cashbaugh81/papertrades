import { Link } from "react-router-dom";
import type { Portfolio, PortfolioState } from "@/lib/types";
import type { PriceIndex } from "@/lib/prices";
import { humanDate, money } from "@/lib/ledger";

type Props = {
  portfolios: Portfolio[];
  states: PortfolioState[];
  /** Kept for callers; fills now come from each portfolio's state. */
  index?: PriceIndex;
};

/**
 * One flat list of every decision, across every portfolio, newest first.
 *
 * This exists because the product's claim is that you will learn something about
 * your own urges. You cannot see a pattern in one portfolio's history at a time;
 * you see it when your chip buys and your healthcare buys sit on the same page.
 */
export default function DecisionsPage({ portfolios, states }: Props) {
  const rows = portfolios
    .flatMap((p) => {
      const state = states.find((s) => s.id === p.id);
      return p.tx.map((t) => ({
        tx: t,
        portfolioId: p.id,
        portfolioName: state?.name ?? p.name,
        fill: state?.fills[t.id],
        pending: !!state?.pending.some((o) => o.txId === t.id),
        rejection: state?.rejections[t.id],
      }));
    })
    .sort((a, b) => (a.tx.date < b.tx.date ? 1 : a.tx.date > b.tx.date ? -1 : 0));

  const buys = rows.filter((r) => r.tx.kind === "buy").length;
  const sells = rows.filter((r) => r.tx.kind === "sell").length;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="figure text-[30px] leading-tight tracking-tight">Every decision</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">
          {rows.length} recorded across {portfolios.length} portfolios — {buys} bought, {sells} sold.
          Read them in order and the pattern in your own behaviour is usually obvious within a minute.
        </p>
      </section>

      <section className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-rule text-left">
              <th className="py-2.5 pr-3 font-medium text-muted">Date</th>
              <th className="px-3 py-2.5 font-medium text-muted">Portfolio</th>
              <th className="px-3 py-2.5 font-medium text-muted">Decision</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted">Amount</th>
              <th className="px-3 py-2.5 text-right font-medium text-muted">Fill</th>
              <th className="px-3 py-2.5 font-medium text-muted">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted">
                  No decisions recorded yet. Open a portfolio to place your first trade.
                </td>
              </tr>
            )}
            {rows.map(({ tx, portfolioId, portfolioName, fill, pending, rejection }) => (
              <tr key={tx.id} className="border-b border-rule/70">
                <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{humanDate(tx.date)}</td>
                <td className="px-3 py-2.5">
                  <Link
                    to={`/p/${portfolioId}`}
                    className="text-muted underline decoration-rule underline-offset-2 transition-colors hover:text-ink"
                  >
                    {portfolioName}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={
                      tx.kind === "buy" ? "text-gain" : tx.kind === "sell" ? "text-loss" : "text-muted"
                    }
                  >
                    {rejection
                      ? tx.kind === "buy"
                        ? "Rejected buy"
                        : "Rejected sell"
                      : pending
                      ? tx.kind === "buy"
                        ? "Buy order"
                        : "Sell order"
                      : tx.kind === "buy"
                        ? "Bought"
                        : tx.kind === "sell"
                          ? "Sold"
                          : "Deposited"}
                  </span>{" "}
                  <span className="font-medium">{tx.ticker ?? ""}</span>
                </td>
                <td className="num px-3 py-2.5">{tx.amount ? money(tx.amount, 2) : "—"}</td>
                <td className="num px-3 py-2.5 text-muted">
                  {fill ? (
                    <span title={`Filled at the ${humanDate(fill.date)} close`}>{money(fill.price, 2)}</span>
                  ) : pending ? (
                    <span className="text-[11px] uppercase tracking-wide">pending</span>
                  ) : rejection ? (
                    <span className="text-[11px] uppercase tracking-wide text-loss" title={rejection.reason}>
                      rejected
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="max-w-64 px-3 py-2.5 text-muted">
                  {tx.note ?? <span className="text-rule">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="max-w-3xl border-t border-rule pt-4 text-[12px] leading-relaxed text-muted">
        An order fills at the first market close after you place it — never at a price that was
        already known when you decided. Until that close is in the data, the order shows as
        pending and its cash is set aside.
      </p>
    </div>
  );
}
