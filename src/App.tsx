import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { Account, Portfolio, PortfolioState, PriceBundle } from "@/lib/types";
import { buildIndex, closeOn, type PriceIndex } from "@/lib/prices";
import { computeAll, baselineId } from "@/lib/ledger";
import { lastCutoff, nyDate } from "@/lib/market";
import { tickersFor } from "@/lib/rows";
import { exampleStart, STARTER_TICKERS } from "@/lib/starters";
import { supabase } from "@/lib/supabase";
import {
  cancelTx,
  fetchPrices,
  loadPortfolios,
  mergeBundles,
  placeOrder,
  seedExamplesOnce,
  signOut,
  startFresh,
  toAccount,
  type OrderInput,
  type TickerInfo,
} from "@/lib/api";
import AuthPage from "@/pages/AuthPage";
import ComparisonPage from "@/pages/ComparisonPage";
import PortfolioPage from "@/pages/PortfolioPage";
import DecisionsPage from "@/pages/DecisionsPage";
import Shell from "@/components/Shell";

export default function App() {
  return (
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  );
}

function Root() {
  // undefined while the stored session is being restored.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const user = session?.user;
  const account = useMemo(
    () => (user ? toAccount(user) : null),
    // Token refreshes hand us a new session object for the same person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, user?.email, user?.user_metadata?.name],
  );

  if (session === undefined) return <Splash text="Opening the ledger…" />;
  if (recovering && session) {
    return <AuthPage initialMode="reset" onResetDone={() => setRecovering(false)} />;
  }
  if (!account) return <AuthPage />;
  return <SignedIn key={account.id} account={account} />;
}

function Splash({ text, detail }: { text: string; detail?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-6">
      <div className="max-w-md text-center">
        <div className={detail ? "figure text-[22px]" : "micro"}>{text}</div>
        {detail && <p className="mt-2 text-[13px] leading-relaxed text-muted">{detail}</p>}
      </div>
    </div>
  );
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ten days before a date, so the first day can fall back to an earlier close. */
function lookback(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
}

/**
 * True when the newest close is clearly older than the last one Tiingo should
 * have published. Weekends and a single holiday don't count.
 */
function isStale(lastDate: string): boolean {
  if (!lastDate) return false;
  const expected = nyDate(lastCutoff());
  const gapDays = (Date.parse(expected) - Date.parse(lastDate)) / 86_400_000;
  return gapDays > 4;
}

function SignedIn({ account }: { account: Account }) {
  const [portfolios, setPortfolios] = useState<Portfolio[] | null>(null);
  const [bundle, setBundle] = useState<PriceBundle | null>(null);
  const [info, setInfo] = useState<Record<string, TickerInfo>>({});
  const loadedFrom = useRef<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setPortfolios(await loadPortfolios());
  }, []);

  // Portfolios: load, seeding the examples on an account's first visit.
  useEffect(() => {
    let alive = true;
    (async () => {
      let ps = await loadPortfolios();
      if (await seedExamplesOnce(ps)) ps = await loadPortfolios();
      if (alive) setPortfolios(ps);
    })().catch((e) => alive && setFatal(errText(e)));
    return () => {
      alive = false;
    };
  }, []);

  // Prices: everything the portfolios need, plus the starter tickers as
  // suggestions, from just before the earliest start date.
  const needed = useMemo(() => {
    const s = new Set<string>(STARTER_TICKERS);
    for (const p of portfolios ?? []) for (const t of tickersFor(p)) s.add(t);
    return [...s].sort();
  }, [portfolios]);
  const from = useMemo(() => {
    const starts = (portfolios ?? []).map((p) => p.startDate);
    const earliest = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : exampleStart(nyDate());
    return lookback(earliest);
  }, [portfolios]);

  useEffect(() => {
    if (!portfolios) return;
    const widen = !loadedFrom.current || from < loadedFrom.current;
    const missing = widen
      ? needed
      : needed.filter((t) => !bundle?.series[t] && info[t]?.status !== "not_found");
    if (missing.length === 0) return;
    let alive = true;
    fetchPrices(missing, widen ? from : loadedFrom.current!)
      .then((r) => {
        if (!alive) return;
        if (widen) loadedFrom.current = from;
        setBundle((b) => (b && !widen ? mergeBundles(b, r.bundle) : r.bundle));
        setInfo((i) => ({ ...i, ...r.info }));
      })
      .catch((e) => {
        if (!alive) return;
        if (bundle) setNotice(errText(e));
        else setFatal(errText(e));
      });
    return () => {
      alive = false;
    };
    // `bundle` and `info` are read to find what's missing, not to trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios, needed, from]);

  const index = useMemo(() => (bundle ? buildIndex(bundle) : null), [bundle]);

  /** Load one ticker on demand (the trade ticket). */
  const lookup = useCallback(
    async (ticker: string): Promise<TickerInfo | undefined> => {
      const r = await fetchPrices([ticker], loadedFrom.current ?? from);
      setBundle((b) => (b ? mergeBundles(b, r.bundle) : r.bundle));
      setInfo((i) => ({ ...i, ...r.info }));
      return r.info[ticker];
    },
    [from],
  );

  const handlers = useMemo(
    () => ({
      onTrade: async (portfolioId: string, order: OrderInput) => {
        await placeOrder(portfolioId, order);
        await reload();
      },
      onDeleteTx: (txId: string) => {
        cancelTx(txId)
          .then((gone) => {
            if (!gone) setNotice("That trade is part of the record now and can't be removed.");
            return reload();
          })
          .catch((e) => setNotice(errText(e)));
      },
      onStartFresh: () => {
        startFresh()
          .then(reload)
          .catch((e) => setNotice(errText(e)));
      },
      onSignOut: () => void signOut(),
    }),
    [reload],
  );

  if (fatal) {
    return <Splash text="Something didn't load" detail={`${fatal} Try reloading the page.`} />;
  }
  if (!portfolios || !index) return <Splash text="Loading the ledger…" />;

  return (
    <AppInner
      account={account}
      portfolios={portfolios}
      index={index}
      lookup={lookup}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      {...handlers}
    />
  );
}

function AppInner({
  account,
  portfolios,
  index,
  lookup,
  notice,
  onDismissNotice,
  onTrade,
  onDeleteTx,
  onStartFresh,
  onSignOut,
}: {
  account: Account;
  portfolios: Portfolio[];
  index: PriceIndex;
  lookup: (ticker: string) => Promise<TickerInfo | undefined>;
  notice: string | null;
  onDismissNotice: () => void;
  onTrade: (portfolioId: string, order: OrderInput) => Promise<void>;
  onDeleteTx: (txId: string) => void;
  onStartFresh: () => void;
  onSignOut: () => void;
}) {
  const states = useMemo(() => computeAll(index, portfolios, index.lastDate), [index, portfolios]);
  const base = baselineId(states);

  const priceFor = useCallback((ticker: string) => closeOn(index, ticker, index.lastDate), [index]);

  return (
    <Shell
      account={account}
      asOf={index.lastDate}
      onSignOut={onSignOut}
      stale={isStale(index.lastDate)}
      notice={notice ? { text: notice, onDismiss: onDismissNotice } : null}
    >
      <Routes>
        <Route
          path="/"
          element={
            <ComparisonPage states={states} portfolios={portfolios} index={index} onStartFresh={onStartFresh} />
          }
        />
        <Route path="/decisions" element={<DecisionsPage portfolios={portfolios} states={states} index={index} />} />
        <Route
          path="/p/:id"
          element={
            <PortfolioRoute
              portfolios={portfolios}
              states={states}
              index={index}
              baselineId={base}
              priceFor={priceFor}
              lookup={lookup}
              onTrade={onTrade}
              onDeleteTx={onDeleteTx}
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
  lookup,
  onTrade,
  onDeleteTx,
}: {
  portfolios: Portfolio[];
  states: PortfolioState[];
  index: PriceIndex;
  baselineId?: string;
  priceFor: (t: string) => number | undefined;
  lookup: (ticker: string) => Promise<TickerInfo | undefined>;
  onTrade: (portfolioId: string, order: OrderInput) => Promise<void>;
  onDeleteTx: (txId: string) => void;
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
      onTrade={(o) => onTrade(portfolio.id, o)}
      onDeleteTx={onDeleteTx}
      priceFor={priceFor}
      lookup={lookup}
    />
  );
}
