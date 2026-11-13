import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { Account, PortfolioState, PriceBundle } from "@/lib/types";
import { buildIndex } from "@/lib/prices";
import { computeState } from "@/lib/ledger";
import { lastCutoff, nyDate } from "@/lib/market";
import { CALENDAR_TICKER, tickersFor } from "@/lib/rows";
import { supabase } from "@/lib/supabase";
import {
  addColumn,
  cancelTx,
  changeMix,
  fetchPrices,
  loadActiveSet,
  mergeBundles,
  SessionEnded,
  signOut,
  toAccount,
  type ActiveSet,
  type Mix,
  type TickerInfo,
} from "@/lib/api";
import AuthPage from "@/pages/AuthPage";
import LandingPage from "@/landing/LandingPage";
import DashboardPage from "@/pages/DashboardPage";
import SetupPage, { DEFAULT_FUND } from "@/pages/SetupPage";
import Shell from "@/components/Shell";

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
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

  // The router writes its root as "/papertrades" (no slash); the static host
  // only serves "/papertrades/", so a reload there would 404. Keep the slash.
  const location = useLocation();
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    if (window.location.pathname === base.replace(/\/$/, "")) {
      window.history.replaceState(window.history.state, "", base + window.location.search + window.location.hash);
    }
  }, [location]);

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
  const home = account ? <SignedIn key={account.id} account={account} /> : <LandingPage />;
  return (
    <Routes>
      <Route path="/" element={home} />
      <Route path="/signin" element={account ? <Navigate to="/" replace /> : <AuthPage key="in" initialMode="in" />} />
      <Route path="/start" element={account ? <Navigate to="/" replace /> : <AuthPage key="up" initialMode="up" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Splash({ text, detail, onSignOut }: { text: string; detail?: string; onSignOut?: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-6">
      <div className="max-w-md text-center">
        <div className={detail ? "figure text-[22px]" : "micro"}>{text}</div>
        {detail && <p className="mt-2 text-[13px] leading-relaxed text-muted">{detail}</p>}
        {onSignOut && (
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-md bg-accent px-5 text-[14px] font-semibold text-paper"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-11 rounded-md border border-rule bg-surface px-5 text-[14px] font-medium text-ink"
            >
              Sign out
            </button>
          </div>
        )}
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
  // undefined while loading; null when the user hasn't started a comparison.
  const [set, setSet] = useState<ActiveSet | null | undefined>(undefined);
  const [setup, setSetup] = useState<{ initial?: SetupInitial } | null>(null);
  const [bundle, setBundle] = useState<PriceBundle | null>(null);
  const [info, setInfo] = useState<Record<string, TickerInfo>>({});
  const loadedFrom = useRef<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();

  /** A session the server no longer accepts: sign out here and ask for a fresh sign-in. */
  const endSession = useCallback(() => {
    void signOut().then(() =>
      navigate("/signin", { replace: true, state: { notice: "Your session ended. Please sign in again." } }),
    );
  }, [navigate]);

  const reload = useCallback(async () => {
    setSet(await loadActiveSet());
  }, []);

  useEffect(() => {
    reload().catch((e) => setFatal(errText(e)));
  }, [reload]);

  // Prices for every ticker in the comparison (plus SPY, the calendar, and the
  // default fund), from just before its start date.
  const needed = useMemo(() => {
    const s = new Set<string>([CALENDAR_TICKER, DEFAULT_FUND]);
    for (const c of set?.columns ?? []) for (const t of tickersFor(c.portfolio)) s.add(t);
    return [...s].sort();
  }, [set]);
  const from = useMemo(() => lookback(set?.startDate ?? nyDate()), [set]);

  useEffect(() => {
    if (set === undefined) return;
    const widen = !loadedFrom.current || from < loadedFrom.current;
    const missing = widen ? needed : needed.filter((t) => !bundle?.series[t] && info[t]?.status !== "not_found");
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
        if (e instanceof SessionEnded) return endSession();
        if (bundle) setNotice(errText(e));
        else setFatal(errText(e));
      });
    return () => {
      alive = false;
    };
    // `bundle` and `info` are read to find what's missing, not to trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, needed, from]);

  const index = useMemo(() => (bundle ? buildIndex(bundle) : null), [bundle]);

  /** Look a ticker up (and load its prices) as it's typed into a mix. */
  const lookup = useCallback(
    async (ticker: string): Promise<TickerInfo | undefined> => {
      const r = await fetchPrices([ticker], loadedFrom.current ?? from);
      setBundle((b) => (b ? mergeBundles(b, r.bundle) : r.bundle));
      setInfo((i) => ({ ...i, ...r.info }));
      return r.info[ticker];
    },
    [from],
  );

  const suggestions = useMemo(
    () => [...new Set([...SUGGESTED, ...Object.keys(info).filter((t) => info[t].status === "ok")])].sort(),
    [info],
  );

  const states = useMemo(() => {
    const m = new Map<string, PortfolioState>();
    if (!index || !set) return m;
    for (const c of set.columns) m.set(c.portfolio.id, computeState(index, c.portfolio, index.lastDate));
    return m;
  }, [index, set]);

  if (fatal)
    return <Splash text="Something didn't load" detail={`${fatal} Try reloading the page.`} onSignOut={() => void signOut()} />;
  if (set === undefined || !index) return <Splash text="Loading the ledger…" />;

  const shell = (children: React.ReactNode) => (
    <Shell
      account={account}
      asOf={index.lastDate}
      onSignOut={() => void signOut()}
      stale={isStale(index.lastDate)}
      notice={notice ? { text: notice, onDismiss: () => setNotice(null) } : null}
    >
      {children}
    </Shell>
  );

  if (!set || setup) {
    return shell(
      <SetupPage
        key={setup ? "again" : "first"}
        info={info}
        lookup={lookup}
        suggestions={suggestions}
        initial={setup?.initial}
        onCancel={set ? () => setSetup(null) : undefined}
        onCreated={() => {
          setSetup(null);
          reload().catch((e) => setNotice(errText(e)));
        }}
      />,
    );
  }

  const mixesBySlot = [1, 2, 3].map((slot) => {
    const c = set.columns.find((x) => x.slot === slot);
    const s = c ? states.get(c.portfolio.id) : undefined;
    return s?.currentWeights ?? c?.portfolio.tx.find((t) => t.kind === "rebalance")?.weights;
  });

  return shell(
    <DashboardPage
      set={set}
      states={states}
      info={info}
      lookup={lookup}
      suggestions={suggestions}
      pricesThrough={index.lastDate}
      onChangeMix={async (pid, mix, note) => {
        await changeMix(pid, mix, note);
        await reload();
      }}
      onAddColumn={async (slot, mix) => {
        await addColumn(set.id, slot, mix);
        await reload();
      }}
      onCancelTx={(txId) => {
        cancelTx(txId)
          .then((gone) => {
            if (!gone) setNotice("That has already happened and can't be cancelled.");
            return reload();
          })
          .catch((e) => setNotice(errText(e)));
      }}
      onChangeDate={() =>
        setSetup({ initial: { amount: set.initial, weekly: set.weekly, startDate: set.startDate, mixes: mixesBySlot } })
      }
      onStartOver={() => setSetup({ initial: undefined })}
    />,
  );
}

/** Common funds offered as suggestions while typing a ticker. */
const SUGGESTED = ["VTI", "VOO", "SPY", "QQQ", "DIA", "BND", "VXUS", "SCHD", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"];

type SetupInitial = { amount: number; weekly: number; startDate?: string; mixes?: (Mix | undefined)[] };
