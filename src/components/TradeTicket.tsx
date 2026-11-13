import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Info, Plus } from "lucide-react";
import type { PortfolioState } from "@/lib/types";
import type { OrderInput, TickerInfo } from "@/lib/api";
import { humanDate, money } from "@/lib/ledger";

const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

type Mode = "buy" | "sell" | "cash";

type Props = {
  state: PortfolioState;
  /**
   * Last trading day present in the price data. Used only to label the
   * estimate: orders fill at the next close after they are placed.
   */
  lastClose: string;
  priceFor: (ticker: string) => number | undefined;
  /** Tickers already loaded, offered as suggestions. Any other ticker can be typed. */
  tickers: string[];
  /** Load a ticker's prices that isn't loaded yet. */
  lookup: (ticker: string) => Promise<TickerInfo | undefined>;
  onTrade: (order: OrderInput) => Promise<void>;
};

type Lookup = { ticker: string; state: "loading" | "not_found" | "error"; message?: string };

export default function TradeTicket({ state, lastClose, priceFor, tickers, lookup, onTrade }: Props) {
  const [mode, setMode] = useState<Mode>("buy");
  const [ticker, setTicker] = useState(state.holdings[0]?.ticker ?? tickers[0] ?? "");
  const [amount, setAmount] = useState("500");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [looked, setLooked] = useState<Lookup | null>(null);

  const price = priceFor(ticker);

  // A ticker we don't have prices for yet: look it up after a pause in typing.
  useEffect(() => {
    if (mode !== "buy" || !TICKER_RE.test(ticker) || price !== undefined) return;
    if (looked?.ticker === ticker) return;
    const t = window.setTimeout(() => {
      setLooked({ ticker, state: "loading" });
      lookup(ticker)
        .then((info) => {
          if (!info || info.status === "ok") setLooked(null);
          else
            setLooked({
              ticker,
              state: info.status === "not_found" ? "not_found" : "error",
              message: info.error ?? undefined,
            });
        })
        .catch((e) => setLooked({ ticker, state: "error", message: e instanceof Error ? e.message : String(e) }));
    }, 500);
    return () => window.clearTimeout(t);
  }, [mode, ticker, price, looked, lookup]);

  const numeric = Number(amount);
  const held = state.holdings.find((h) => h.ticker === ticker)?.units ?? 0;

  const estimate = useMemo(() => {
    if (mode === "cash" || !price || !(numeric > 0)) return null;
    return numeric / price;
  }, [mode, price, numeric]);

  // Cash already promised to pending buys cannot be spent twice.
  const cash = state.availableCash;
  const pendingSells = state.pending
    .filter((o) => o.kind === "sell" && o.ticker === ticker)
    .reduce((a, o) => a + o.amount, 0);
  const cashShort = mode === "buy" && numeric > cash + 1e-6;
  // A sell is sized in dollars and fills at the next close, so this check uses
  // the last close as an estimate; the engine caps it at what is actually held.
  const unitsShort =
    mode === "sell" && price !== undefined && (numeric + pendingSells) / price > held * 1.0001 + 1e-9;
  const needsPrice = mode !== "cash";
  const invalid =
    busy || !(numeric > 0) || (needsPrice && !price) || cashShort || unitsShort;

  const noCash = cash < 1 && mode === "buy";

  async function send(order: OrderInput) {
    setBusy(true);
    try {
      await onTrade(order);
      setNote("");
      setAmount("500");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!(numeric > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }

    if (mode === "cash") {
      void send({ kind: "deposit", amount: numeric, note: note.trim() || undefined });
      return;
    }

    if (!price) {
      setError(`No price data for ${ticker}.`);
      return;
    }
    if (cashShort) {
      setError(
        `That needs ${money(numeric)} but this portfolio has ${money(cash)} of cash free. ` +
          `Use "Add cash" to top it up, or sell something first.`,
      );
      return;
    }
    if (unitsShort) {
      setError(`That would sell more than you hold (${held.toFixed(2)} units).`);
      return;
    }

    // No price or time is sent: the server stamps the time, and the order
    // fills at the first close after it.
    void send({ kind: mode, ticker, amount: numeric, note: note.trim() || undefined });
  }

  const submitLabel = busy
    ? "Saving…"
    : mode === "cash"
      ? `Add ${money(numeric || 0)} of cash`
      : `Place order: ${mode === "buy" ? "buy" : "sell"} ${ticker || "—"} at the next close`;

  return (
    <form
      onSubmit={submit}
      className="rounded-sm border border-rule bg-surface p-5 shadow-[0_1px_0_rgba(22,25,29,0.03)]"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[15px] font-medium">Record a transaction</h3>
        <span className="micro">{mode === "cash" ? "added now" : "fills at next close"}</span>
      </div>

      <div className="mb-4 flex items-center gap-1 rounded-sm bg-paper p-1 text-xs">
        <ModeTab active={mode === "buy"} onClick={() => setMode("buy")} icon={<ArrowUpRight size={13} />} label="Buy" />
        <ModeTab active={mode === "sell"} onClick={() => setMode("sell")} icon={<ArrowDownLeft size={13} />} label="Sell" />
        <ModeTab active={mode === "cash"} onClick={() => setMode("cash")} icon={<Plus size={13} />} label="Add cash" />
      </div>

      <div className={`grid gap-3 ${mode === "cash" ? "" : "sm:grid-cols-2"}`}>
        {mode === "buy" && (
          <label className="block">
            <span className="micro">Ticker</span>
            <input
              value={ticker}
              list="ticker-suggestions"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. VTI"
              onChange={(e) => {
                setTicker(e.target.value.trim().toUpperCase());
                setError(null);
              }}
              className="mt-1 w-full rounded-sm border border-rule bg-surface px-2.5 py-2 text-sm uppercase"
            />
            <datalist id="ticker-suggestions">
              {tickers.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
        )}
        {mode === "sell" && (
          <label className="block">
            <span className="micro">Ticker</span>
            <select
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value);
                setError(null);
              }}
              className="mt-1 w-full rounded-sm border border-rule bg-surface px-2.5 py-2 text-sm"
            >
              {(mode === "sell" && state.holdings.length === 0
                ? []
                : mode === "sell"
                  ? state.holdings.map((h) => h.ticker)
                  : tickers
              ).map((t) => (
                <option key={t} value={t}>
                  {t}
                  {mode === "sell"
                    ? ` (${(state.holdings.find((h) => h.ticker === t)?.units ?? 0).toFixed(2)})`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="micro">
            {mode === "cash" ? "Amount to add" : mode === "buy" ? "Amount" : "Value to sell"}
          </span>
          <div className="relative mt-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              className="num w-full rounded-sm border border-rule bg-surface py-2 pl-6 pr-2.5 text-sm"
            />
          </div>
        </label>
      </div>

      {mode !== "cash" && (
        <div className="mt-3 flex items-baseline justify-between border-t border-rule pt-3 text-xs">
          <span className="text-muted">
            {price ? (
              <>
                {ticker} last closed at <span className="num text-ink">{money(price, 2)}</span>
                <span className="ml-1">({humanDate(lastClose)})</span>
              </>
            ) : !ticker ? (
              "Type a ticker"
            ) : looked?.ticker === ticker && looked.state === "loading" ? (
              `Looking up ${ticker}…`
            ) : looked?.ticker === ticker && looked.state === "not_found" ? (
              `No ticker called ${ticker}`
            ) : looked?.ticker === ticker && looked.state === "error" ? (
              `Couldn't load ${ticker} right now`
            ) : TICKER_RE.test(ticker) ? (
              `Looking up ${ticker}…`
            ) : (
              "That isn't a ticker"
            )}
          </span>
          <span className="text-muted">
            {estimate ? (
              <>
                ≈ <span className="num text-ink">{estimate.toFixed(4)}</span> units, est.
              </>
            ) : (
              "—"
            )}
          </span>
        </div>
      )}

      <div className="mt-1 flex items-baseline justify-between text-xs">
        <span className="text-muted">
          {state.pending.length ? "Cash free (after pending orders)" : "Cash in this portfolio"}
        </span>
        <span className="num text-ink">{money(cash, 2)}</span>
      </div>

      <label className="mt-3 block">
        <span className="micro">Why (optional, and worth writing)</span>
        <input
          type="text"
          value={note}
          maxLength={140}
          placeholder={
            mode === "cash"
              ? "Where this money came from"
              : "What were you thinking when you made this call?"
          }
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-sm border border-rule bg-surface px-2.5 py-2 text-sm placeholder:text-muted/70"
        />
      </label>

      {(error || cashShort || unitsShort) && (
        <div className="mt-3 rounded-sm border-l-2 border-loss bg-loss/5 px-3 py-2 text-xs leading-relaxed text-loss">
          <p role="alert">
            {error ??
              (cashShort
                ? `Not enough cash: this needs ${money(numeric)}, you have ${money(cash)} free.`
                : `You only hold ${held.toFixed(2)} units of ${ticker}.`)}
          </p>
          {(cashShort || noCash) && (
            <button
              type="button"
              onClick={() => {
                setMode("cash");
                setError(null);
              }}
              className="mt-1.5 font-medium underline decoration-loss/40 underline-offset-2 hover:decoration-loss"
            >
              Add cash to this portfolio →
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={invalid}
        className="mt-4 w-full rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitLabel}
      </button>

      {mode === "cash" && (
        <button
          type="button"
          onClick={() => {
            setMode("buy");
            setError(null);
          }}
          className="mt-2 w-full text-center text-[11px] text-muted underline decoration-rule underline-offset-2 transition-colors hover:text-ink"
        >
          Back to buying
        </button>
      )}

      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted">
        <Info size={12} className="mt-0.5 shrink-0" />
        {mode === "cash"
          ? "Cash added here is new money into this portfolio, and counts as money put in — it will not inflate your return."
          : "Orders fill at the next market close after you place them, so the price is one you could not have known. No fees, slippage or tax — this is a record of decisions, not an execution venue."}
      </p>
    </form>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors duration-150 ${
        active ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
      }`}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
