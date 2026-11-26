import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import TickerField from "@/components/TickerField";
import { shareText } from "@/components/MixEditor";
import type { TickerInfo, TradeRequest, TradeResult } from "@/lib/api";
import { humanDate, money, TAX_RATES, taxOn } from "@/lib/ledger";
import type { PriceIndex } from "@/lib/prices";
import { cashAvailableOn, checkTrade, sharesHeldOn, tradingDayFor } from "@/lib/trades";
import type { Portfolio, PortfolioState, Tx } from "@/lib/types";

export type { TradeRequest, TradeResult };

type SellSize = "pct" | "usd" | "shares" | "all";
type BuySize = "usd" | "shares";

/**
 * Sell part or all of a holding, or buy with the cash, on a date at that day's
 * close. The preview replays the whole portfolio with the trade added (the same
 * check the server makes), so what it shows is what will happen.
 */
export default function TradeDialog({
  open,
  onClose,
  index,
  portfolio,
  state,
  info,
  lookup,
  onPlace,
}: {
  /** Sell this holding, or buy (from the cash). Null = closed. */
  open: { kind: "sell"; ticker: string } | { kind: "buy" } | null;
  onClose: () => void;
  index: PriceIndex;
  portfolio: Portfolio;
  state: PortfolioState;
  info: Record<string, TickerInfo>;
  lookup: (ticker: string) => Promise<unknown>;
  onPlace: (t: TradeRequest) => Promise<TradeResult>;
}) {
  const [kind, setKind] = useState<"buy" | "sell">("sell");
  const [ticker, setTicker] = useState("");
  const [date, setDate] = useState(index.lastDate);
  const [sellSize, setSellSize] = useState<SellSize>("pct");
  const [buySize, setBuySize] = useState<BuySize>("usd");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<TradeResult | null>(null);
  const [looking, setLooking] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  // Opening resets the form for this holding (or for a purchase).
  useEffect(() => {
    if (!open) return;
    setKind(open.kind);
    setTicker(open.kind === "sell" ? open.ticker : "");
    setDate(index.lastDate);
    setSellSize("pct");
    setBuySize("usd");
    setValue(open.kind === "sell" ? "50" : "");
    setServer(null);
    const back = document.activeElement as HTMLElement | null;
    window.setTimeout(() => first.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      back?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const day = tradingDayFor(state, date) ?? index.lastDate;
  const price = ticker ? index.close(ticker, day) : undefined;
  const held = ticker && kind === "sell" ? sharesHeldOn(index, state, ticker, date) : 0;
  const cash = cashAvailableOn(state, date);
  const n = Number(value);

  /** The trade as typed, ready to check and send; or why it isn't ready. */
  const request = useMemo((): { req?: TradeRequest; wait?: string } => {
    if (!ticker) return { wait: "Pick a stock or fund to buy." };
    if (!date || date < portfolio.startDate || date > index.lastDate) {
      return { wait: `Pick a date from ${humanDate(portfolio.startDate)} to ${humanDate(index.lastDate)}.` };
    }
    if (kind === "sell") {
      if (sellSize === "all") return { req: { kind, ticker, date, fraction: 1 } };
      if (!(n > 0)) return { wait: "Enter how much to sell." };
      if (sellSize === "pct") {
        if (n > 100) return { wait: "That's more than 100% of the holding." };
        return { req: { kind, ticker, date, fraction: n >= 100 ? 1 : n / 100 } };
      }
      if (!price) return { wait: `No ${ticker} price on ${humanDate(day)}.` };
      const shares = sellSize === "shares" ? n : n / price;
      // Asking for every share held sells all of it (no leftover sliver).
      if (held > 0 && shares >= held * (1 - 1e-9) && shares <= held * (1 + 1e-6)) return { req: { kind, ticker, date, fraction: 1 } };
      return { req: { kind, ticker, date, amount: Math.round((sellSize === "usd" ? n : n * price) * 100) / 100 } };
    }
    if (!(n > 0)) return { wait: "Enter how much to buy." };
    if (!price) return { wait: looking ? `Loading ${ticker}'s prices…` : `No ${ticker} price on ${humanDate(day)}.` };
    return { req: { kind, ticker, date, amount: Math.round((buySize === "usd" ? n : n * price) * 100) / 100 } };
  }, [ticker, date, kind, sellSize, buySize, n, price, held, day, looking, portfolio.startDate, index.lastDate]);

  /** The same check the server makes, on the same engine. */
  const check = useMemo(() => {
    if (!request.req) return undefined;
    const tx: Tx = { id: "preview", ...request.req };
    return checkTrade(index, portfolio, tx, index.lastDate);
  }, [request.req, index, portfolio]);

  if (!open) return null;

  async function place() {
    if (!request.req || !check?.ok) return;
    setBusy(true);
    setServer(null);
    try {
      const r = await onPlace(request.req);
      if (r.ok) onClose();
      else setServer(r);
    } catch (e) {
      setServer({ ok: false, problem: e instanceof Error ? e.message : "That didn't save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const f = check?.fill;
  const gain = f?.gain;
  const tax = gain ? taxOn(gain.shortTerm, gain.longTerm) : 0;
  const cashAfter = check?.state ? cashAvailableOn(check.state, date) : undefined;
  const problem = server?.problem ?? check?.own;
  const others = server?.others?.length ? server.others : check?.others ?? [];
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-[12px] font-medium ${on ? "bg-ink text-surface" : "text-ink hover:bg-ink/5"}`;
  const label = "micro mb-1 block";
  const input = "num w-full rounded-sm border border-rule bg-surface px-2.5 py-2 text-sm";

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-ink/50 sm:place-items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-title"
        data-testid="trade-dialog"
        className="relative w-full max-w-[460px] rounded-t-md bg-surface p-5 shadow-xl sm:rounded-md sm:p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-sm text-muted hover:bg-paper hover:text-ink"
        >
          <X size={18} aria-hidden />
        </button>
        <h2 id="trade-title" className="text-[17px] font-medium">
          {kind === "sell" ? `Sell ${ticker}` : "Buy with cash"}
        </h2>
        <p className="mt-1 text-[12px] text-muted">
          At the close on the day you pick{kind === "buy" ? ", from this portfolio's cash" : ""}. The money from a sale stays in
          cash until you buy something with it.
        </p>

        <div className="mt-4 space-y-4">
          {kind === "buy" && (
            <div>
              <span className={label}>Stock or fund</span>
              <TickerField
                value={ticker}
                label="Stock or fund to buy"
                testId="trade-ticker"
                onPending={setLooking}
                onCommit={(t) => {
                  const up = t.trim().toUpperCase();
                  setTicker(up);
                  if (up) {
                    setLooking(true);
                    lookup(up).finally(() => setLooking(false));
                  }
                }}
              />
              {ticker && info[ticker]?.name && <div className="mt-1 text-[11px] text-muted">{info[ticker].name}</div>}
            </div>
          )}

          <div>
            <label htmlFor="trade-date" className={label}>
              Date
            </label>
            <input
              id="trade-date"
              ref={kind === "sell" ? first : undefined}
              type="date"
              value={date}
              min={portfolio.startDate}
              max={index.lastDate}
              onChange={(e) => {
                setDate(e.target.value);
                setServer(null);
              }}
              className={input}
              data-testid="trade-date"
            />
            <div className="mt-1 text-[11px] text-muted" data-testid="trade-day-note">
              {day !== date && date ? `The market was closed then, so this uses the next trading day, ${humanDate(day)}. ` : ""}
              {price ? `${ticker} closed at ${money(price, 2)} on ${humanDate(day)}.` : ""}
            </div>
          </div>

          <div>
            <span className={label}>How much</span>
            <div className="mb-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Size by">
              {(kind === "sell"
                ? ([
                    ["pct", "% of it"],
                    ["usd", "Dollars"],
                    ["shares", "Shares"],
                    ["all", "All"],
                  ] as const)
                : ([
                    ["usd", "Dollars"],
                    ["shares", "Shares"],
                  ] as const)
              ).map(([k, text]) => {
                const on = kind === "sell" ? sellSize === k : buySize === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={chip(on)}
                    data-size={k}
                    onClick={() => {
                      setServer(null);
                      if (kind === "sell") setSellSize(k as SellSize);
                      else setBuySize(k as BuySize);
                      setValue(k === "pct" ? "50" : "");
                    }}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
            {!(kind === "sell" && sellSize === "all") && (
              <div className="relative">
                <input
                  ref={kind === "buy" ? undefined : undefined}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setServer(null);
                  }}
                  aria-label={
                    (kind === "sell" ? sellSize : buySize) === "pct" ? "Percent of the holding" : (kind === "sell" ? sellSize : buySize) === "usd" ? "Dollars" : "Shares"
                  }
                  className={`${input} pr-10`}
                  data-testid="trade-amount"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted">
                  {(kind === "sell" ? sellSize : buySize) === "pct" ? "%" : (kind === "sell" ? sellSize : buySize) === "usd" ? "$" : "sh"}
                </span>
              </div>
            )}
            <div className="mt-1 text-[11px] text-muted" data-testid="trade-available">
              {kind === "sell"
                ? held > 0 && price
                  ? `Held on ${humanDate(day)}: ${shareText(held)} shares, worth ${money(held * price, 2)}.`
                  : `No ${ticker} held on ${humanDate(day)}.`
                : `Cash you can spend on ${humanDate(day)}: ${money(cash, 2)}${cash < state.cash - 0.5 ? " (the rest is used by later purchases)" : ""}.`}
            </div>
          </div>

          {/* Preview: what will happen, or why it can't. */}
          <div className="rounded-sm border border-rule bg-paper/60 p-3 text-[12px]" aria-live="polite" data-testid="trade-preview">
            {request.wait ? (
              <span className="text-muted">{request.wait}</span>
            ) : problem ? (
              <span className="text-loss" data-testid="trade-problem">
                {problem}
              </span>
            ) : others.length ? (
              <div className="text-loss" data-testid="trade-problem">
                This would stop {others.length === 1 ? "another trade" : `${others.length} other trades`} from working:
                <ul className="m-0 mt-1 list-disc pl-4">
                  {others.map((o) => (
                    <li key={o.txId}>{o.reason}</li>
                  ))}
                </ul>
                Delete {others.length === 1 ? "that trade" : "those"} first, or change this one.
              </div>
            ) : f ? (
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted">{kind === "sell" ? "Sells" : "Buys"}</dt>
                <dd className="num m-0 text-right" data-testid="trade-preview-shares">
                  {shareText(f.units)} shares at {money(f.price, 2)} on {humanDate(f.date)}
                </dd>
                <dt className="text-muted">{kind === "sell" ? "Brings in" : "Costs"}</dt>
                <dd className="num m-0 text-right font-medium">{money(f.amount, 2)}</dd>
                {gain && (
                  <>
                    <dt className="text-muted">{gain.shortTerm + gain.longTerm >= 0 ? "Gain on it" : "Loss on it"}</dt>
                    <dd className={`num m-0 text-right ${gain.shortTerm + gain.longTerm >= 0 ? "text-gain" : "text-loss"}`}>
                      {gain.shortTerm + gain.longTerm >= 0 ? "+" : "−"}
                      {money(Math.abs(gain.shortTerm + gain.longTerm), 2)}
                      {Math.abs(gain.longTerm) > 0.005 && Math.abs(gain.shortTerm) > 0.005
                        ? " (short- and long-term)"
                        : Math.abs(gain.longTerm) > 0.005
                          ? " (long-term)"
                          : " (short-term)"}
                    </dd>
                    <dt className="text-muted">Estimated tax</dt>
                    <dd className="num m-0 text-right">
                      {money(tax, 2)}
                      <span className="text-muted">
                        {" "}
                        at {Math.round(TAX_RATES.shortTerm * 100)}% / {Math.round(TAX_RATES.longTerm * 100)}%
                      </span>
                    </dd>
                  </>
                )}
                {cashAfter !== undefined && (
                  <>
                    <dt className="text-muted">Cash then</dt>
                    <dd className="num m-0 text-right">{money(cashAfter, 2)}</dd>
                  </>
                )}
              </dl>
            ) : (
              <span className="text-muted">That trade wouldn't happen by the latest close.</span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={place}
              disabled={busy || !check?.ok || !!server?.problem}
              className="rounded-sm bg-accent px-4 py-2 text-[13px] font-medium text-paper disabled:opacity-50"
              data-testid="trade-confirm"
            >
              {busy ? "Saving…" : kind === "sell" ? `Sell ${ticker}` : ticker ? `Buy ${ticker}` : "Buy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-rule px-4 py-2 text-[13px] text-muted hover:border-ink/30 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
