import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import type { Portfolio, PortfolioState } from "@/lib/types";
import type { OrderInput, TickerInfo } from "@/lib/api";
import type { PriceIndex } from "@/lib/prices";
import PathChart from "@/components/PathChart";
import TradeTicket from "@/components/TradeTicket";
import { historyDays, humanDate, money, pct, signedPct } from "@/lib/ledger";

type Props = {
  portfolio: Portfolio;
  state: PortfolioState;
  index: PriceIndex;
  states: PortfolioState[];
  baseline?: PortfolioState;
  onTrade: (order: OrderInput) => Promise<void>;
  /** Cancel a pending order, or remove a row from an example portfolio. */
  onDeleteTx: (txId: string) => void;
  priceFor: (ticker: string) => number | undefined;
  lookup: (ticker: string) => Promise<TickerInfo | undefined>;
};

export default function PortfolioPage({
  portfolio,
  state,
  index,
  states,
  baseline,
  onTrade,
  onDeleteTx,
  priceFor,
  lookup,
}: Props) {
  const spread = baseline ? state.returnOnInvested - baseline.returnOnInvested : 0;
  const days = historyDays(state.dates);
  const sortedTx = [...portfolio.tx].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <div className="space-y-9">
      <div>
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={13} /> All portfolios
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="figure text-[32px] leading-tight tracking-tight">{state.name}</h1>
            <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-muted">{state.thesis}</p>
          </div>
          <div className="text-right">
            <div className="micro">worth today</div>
            <div className="num figure text-[32px] leading-none tracking-tight">{money(state.value)}</div>
            <div
              className={`num mt-1 text-[13px] ${state.returnOnInvested >= 0 ? "text-gain" : "text-loss"}`}
            >
              {signedPct(state.returnOnInvested)} on {money(state.invested)}
            </div>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-rule py-5 md:grid-cols-5">
        <Stat label="Put in" value={money(state.invested)} />
        <Stat
          label="Cash left"
          value={money(state.availableCash, 2)}
          hint={state.pending.length ? `${money(state.cash - state.availableCash)} held for orders` : undefined}
        />
        <Stat
          label="Max drop"
          value={pct(state.maxDrawdown)}
          tone="loss"
          hint="deepest fall, deposits excluded"
        />
        <Stat label="Volatility" value={pct(state.volatility)} hint="annualised, deposits excluded" />
        <Stat
          label="vs baseline"
          value={baseline ? (baseline.id === state.id ? "—" : signedPct(spread)) : "—"}
          tone={spread >= 0 ? "gain" : "loss"}
          hint={baseline ? baseline.name : undefined}
        />
      </section>

      {state.rejected.length > 0 && (
        <div className="flex items-start gap-2 rounded-sm border-l-2 border-loss bg-loss/5 px-3.5 py-2.5 text-[12px] leading-relaxed text-loss">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <div>
            <strong className="font-medium">
              {state.rejected.length} trade(s) here could not be filled
            </strong>{" "}
            and are excluded from the value shown. {state.rejected.join("; ")}
          </div>
        </div>
      )}

      {state.pending.length > 0 && (
        <section className="rounded-sm border border-rule bg-surface px-4 py-3 text-[13px]">
          <div className="mb-1.5 flex items-baseline justify-between">
            <h2 className="font-medium">Waiting to fill</h2>
            <span className="micro">at the next close</span>
          </div>
          <ul className="space-y-1 text-muted">
            {state.pending.map((o) => (
              <li key={o.txId} className="flex justify-between gap-3">
                <span>
                  <span className={o.kind === "buy" ? "text-gain" : "text-loss"}>
                    {o.kind === "buy" ? "Buy" : "Sell"}
                  </span>{" "}
                  <span className="font-medium text-ink">{o.ticker}</span>
                  <span className="ml-2 text-[11px]">placed {placedLabel(o.placedAt)}</span>
                </span>
                <span className="num text-ink">{money(o.amount, 2)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium">Path</h2>
          <span className="micro">
            {days} days · {humanDate(state.dates[0] ?? "")} → {humanDate(index.lastDate)}
          </span>
        </div>
        <div className="rounded-sm border border-rule bg-surface p-4">
          <PathChart states={states} baselineId={baseline?.id} height={260} />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[15px] font-medium">Holdings</h2>
              <span className="micro">{state.holdings.length} positions</span>
            </div>

            {state.holdings.length === 0 ? (
              <p className="rounded-sm border border-rule bg-surface px-4 py-6 text-center text-[13px] text-muted">
                Nothing held yet. Use the ticket to put the cash to work.
              </p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-rule text-left">
                    <th className="py-2 pr-3 font-medium text-muted">Ticker</th>
                    <th className="px-3 py-2 text-right font-medium text-muted">Units</th>
                    <th className="px-3 py-2 text-right font-medium text-muted">Price</th>
                    <th className="px-3 py-2 text-right font-medium text-muted">Value</th>
                    <th className="w-20 px-3 py-2 text-right font-medium text-muted">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {state.holdings.map((h) => (
                    <tr key={h.ticker} className="border-b border-rule/70">
                      <td className="py-2.5 pr-3 font-medium">{h.ticker}</td>
                      <td className="num px-3 py-2.5 text-muted">{h.units.toFixed(4)}</td>
                      <td className="num px-3 py-2.5 text-muted">{money(h.price, 2)}</td>
                      <td className="num px-3 py-2.5">{money(h.value)}</td>
                      <td className="num px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-muted">{pct(h.weight, 0)}</span>
                          <span className="h-1 w-8 overflow-hidden rounded-full bg-rule">
                            <span
                              className="block h-full rounded-full bg-accent"
                              style={{ width: `${Math.min(100, h.weight * 100)}%` }}
                            />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>

          <section>
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-[15px] font-medium">Decision log</h2>
              <span className="micro">newest first</span>
            </div>
            <p className="mb-3 text-[12px] leading-relaxed text-muted">
              Every trade you made, at the price you got. This is the part worth reading back in
              three months.
            </p>

            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-rule text-left">
                  <th className="py-2 pr-3 font-medium text-muted">Date</th>
                  <th className="px-3 py-2 font-medium text-muted">Decision</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Amount</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Price</th>
                  <th className="px-3 py-2 font-medium text-muted">Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedTx.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted">
                      No trades recorded yet.
                    </td>
                  </tr>
                )}
                {sortedTx.map((t) => {
                  const fill = state.fills[t.id];
                  const px = fill?.price;
                  const isPending = state.pending.some((o) => o.txId === t.id);
                  const rejection = state.rejections[t.id];
                  // The record is permanent once an order has filled or been
                  // rejected. Pending orders can be cancelled; example rows are
                  // not your decisions, so they can go.
                  const removable = isPending || !!portfolio.example;
                  return (
                    <tr key={t.id} className="group border-b border-rule/70">
                      <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{humanDate(t.date)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={
                            t.kind === "buy"
                              ? "text-gain"
                              : t.kind === "sell"
                                ? "text-loss"
                                : "text-muted"
                          }
                        >
                          {rejection
                            ? t.kind === "buy"
                              ? "Rejected buy"
                              : "Rejected sell"
                            : isPending
                            ? t.kind === "buy"
                              ? "Buy order"
                              : "Sell order"
                            : t.kind === "buy"
                              ? "Bought"
                              : t.kind === "sell"
                                ? "Sold"
                                : "Deposited"}
                        </span>{" "}
                        <span className="font-medium">{t.ticker ?? ""}</span>
                      </td>
                      <td className="num px-3 py-2.5">{t.amount ? money(t.amount, 2) : "—"}</td>
                      <td className="num px-3 py-2.5 text-muted">
                        {px ? (
                          money(px, 2)
                        ) : isPending ? (
                          <span className="text-[11px] uppercase tracking-wide">pending</span>
                        ) : rejection ? (
                          <span className="text-[11px] uppercase tracking-wide text-loss" title={rejection.reason}>
                            rejected
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-52 px-3 py-2.5 text-muted">
                        {t.note ? <span className="line-clamp-2">{t.note}</span> : <span className="text-rule">—</span>}
                      </td>
                      <td className="pl-2 text-right">
                        {removable && (
                          <button
                            onClick={() => onDeleteTx(t.id)}
                            className={`text-[11px] text-muted transition-opacity duration-150 hover:text-loss focus-visible:opacity-100 ${
                              isPending ? "" : "opacity-0 group-hover:opacity-100"
                            }`}
                            aria-label={`${isPending ? "Cancel order" : "Remove example trade"} from ${humanDate(t.date)}`}
                          >
                            {isPending ? "cancel" : "remove"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <TradeTicket
            state={state}
            lastClose={index.lastDate}
            priceFor={priceFor}
            tickers={index.tickers}
            lookup={lookup}
            onTrade={onTrade}
          />
          <div className="mt-4 space-y-1.5 rounded-sm border border-rule px-3.5 py-3 text-[11px] leading-relaxed text-muted">
            <div className="flex justify-between">
              <span>Start date</span>
              <span className="text-ink">{humanDate(portfolio.startDate)}</span>
            </div>
            <div className="flex justify-between">
              <span>Initial capital</span>
              <span className="num text-ink">{money(portfolio.initial)}</span>
            </div>
            <div className="flex justify-between">
              <span>Monthly deposit</span>
              <span className="num text-ink">{money(portfolio.monthly)}</span>
            </div>
            <div className="flex justify-between">
              <span>Prices as of</span>
              <span className="num text-ink">{humanDate(index.lastDate)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function placedLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div>
      <div className="micro">{label}</div>
      <div
        className={`num mt-1 text-[16px] font-medium ${
          tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] leading-tight text-muted">{hint}</div>}
    </div>
  );
}
