import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import type { Account, AccountData, Portfolio, PortfolioState, Tx } from "@/lib/types";
import { buildIndex, loadPrices, closeOn, type PriceIndex } from "@/lib/prices";
import { computeAll, baselineId } from "@/lib/ledger";
import {
  currentAccount,
  loadData,
  saveData,
  signOut,
  startFresh,
} from "@/lib/store";
import AuthPage from "@/pages/AuthPage";
import ComparisonPage from "@/pages/ComparisonPage";
import PortfolioPage from "@/pages/PortfolioPage";
import DecisionsPage from "@/pages/DecisionsPage";
import Shell from "@/components/Shell";

type ShellProps = {
  priceIndex: PriceIndex;
};

export default function App() {
  return (
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  );
}

function Root() {
  const [account, setAccount] = useState<Account | null>(() => currentAccount());
  const [data, setData] = useState<AccountData | null>(null);
  const [index, setIndex] = useState<PriceIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) {
      setData(null);
      return;
    }
    const d = loadData(account.id);
    setData(d);
  }, [account]);

  useEffect(() => {
    let alive = true;
    loadPrices()
      .then((b) => alive && setIndex(buildIndex(b)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Price data failed to load."));
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((next: AccountData) => {
    saveData(next);
    setData(next);
  }, []);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-6">
        <div className="max-w-md text-center">
          <h1 className="figure text-[22px]">The price history did not load</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{error}</p>
          <p className="mt-3 text-[12px] text-muted">
            Ledger ships a bundled daily series. If this persists, the app was built without
            <code className="mx-1 rounded bg-rule/50 px-1 py-0.5">public/data/prices.json</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!account) {
    // Seed the example portfolios with real history so the first sign-in shows an
    // actual divergence rather than three flat lines. Three years is enough for
    // the paths to separate without swallowing the whole dataset.
    return <AuthPage onAuth={(a) => setAccount(a)} seedStart={seedStartFor(index)} />;
  }

  if (!index || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper">
        <div className="micro">Loading the ledger…</div>
      </div>
    );
  }

  return (
    <AppInner
      account={account}
      data={data}
      index={index}
      persist={persist}
      onStartFresh={() => {
        const next = startFresh(data);
        persist({ ...next, account });
      }}
      onSignOut={() => {
        signOut();
        setAccount(null);
        setData(null);
      }}
    />
  );
}

/** A trading day roughly three years back, used to seed the example portfolios. */
function seedStartFor(index: PriceIndex | null): string | undefined {
  if (!index) return undefined;
  const last = index.lastDate;
  const target = new Date(last + "T00:00:00Z");
  target.setUTCFullYear(target.getUTCFullYear() - 3);
  const iso = target.toISOString().slice(0, 10);
  return index.calendar.find((d) => d >= iso) ?? index.calendar[0];
}

function AppInner({
  account,
  data,
  index,
  persist,
  onSignOut,
  onStartFresh,
}: {
  account: Account;
  data: AccountData;
  index: PriceIndex;
  persist: (d: AccountData) => void;
  onSignOut: () => void;
  onStartFresh: () => void;
}) {
  const states = useMemo(
    () => computeAll(index, data.portfolios, index.lastDate),
    [index, data.portfolios],
  );
  const base = baselineId(states);

  const priceFor = useCallback(
    (ticker: string) => closeOn(index, ticker, index.lastDate),
    [index],
  );

  const addTrade = useCallback(
    (portfolioId: string, tx: Tx) => {
      const next: AccountData = {
        ...data,
        portfolios: data.portfolios.map((p) =>
          p.id === portfolioId ? { ...p, tx: [...p.tx, tx] } : p,
        ),
      };
      persist(next);
    },
    [data, persist],
  );

  const deleteTrade = useCallback(
    (portfolioId: string, txId: string) => {
      const next: AccountData = {
        ...data,
        portfolios: data.portfolios.map((p) =>
          p.id === portfolioId ? { ...p, tx: p.tx.filter((t) => t.id !== txId) } : p,
        ),
      };
      persist(next);
    },
    [data, persist],
  );

  return (
    <Shell account={account} asOf={index.lastDate} onSignOut={onSignOut} stale>
      <Routes>
        <Route
          path="/"
          element={
            <ComparisonPage
              states={states}
              portfolios={data.portfolios}
              index={index}
              onStartFresh={onStartFresh}
            />
          }
        />
        <Route
          path="/decisions"
          element={
            <DecisionsPage portfolios={data.portfolios} states={states} index={index} />
          }
        />
        <Route
          path="/p/:id"
          element={
            <PortfolioRoute
              portfolios={data.portfolios}
              states={states}
              index={index}
              baselineId={base}
              priceFor={priceFor}
              onTrade={addTrade}
              onDeleteTx={deleteTrade}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

function PortfolioRoute({
  portfolios,
  states,
  index,
  baselineId: base,
  priceFor,
  onTrade,
  onDeleteTx,
}: {
  portfolios: Portfolio[];
  states: PortfolioState[];
  index: PriceIndex;
  baselineId?: string;
  priceFor: (t: string) => number | undefined;
  onTrade: (portfolioId: string, tx: Tx) => void;
  onDeleteTx: (portfolioId: string, txId: string) => void;
}) {
  const { id } = useParams<{ id: string }>();
  const portfolio = portfolios.find((p) => p.id === id);
  const state = states.find((s) => s.id === id);

  if (!portfolio || !state) return <Navigate to="/" replace />;

  return (
    <PortfolioPage
      portfolio={portfolio}
      state={state}
      index={index}
      states={states}
      baseline={states.find((s) => s.id === base)}
      onTrade={(tx) => onTrade(portfolio.id, tx)}
      onDeleteTx={(txId) => onDeleteTx(portfolio.id, txId)}
      priceFor={priceFor}
    />
  );
}

export type { ShellProps };
