import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { Portfolio, PortfolioState } from "@/lib/types";
import type { PriceIndex } from "@/lib/prices";
import PathChart from "@/components/PathChart";
import SpreadBar from "@/components/SpreadBar";
import { baselineId, historyDays, humanDate, money, pct, signedPct } from "@/lib/ledger";

type Props = {
  states: PortfolioState[];
  portfolios: Portfolio[];
  index: PriceIndex;
  onStartFresh: () => void;
};

export default function ComparisonPage({ states, portfolios, index, onStartFresh }: Props) {
  const base = baselineId(states);
  const baseState = states.find((s) => s.id === base);

  const metrics = useMemo(() => {
    const sorted = [...states].sort((a, b) => b.returnOnInvested - a.returnOnInvested);
    const spreads = states.map((s) => s.returnOnInvested - (baseState?.returnOnInvested ?? 0));
    const scale = Math.max(...spreads.map(Math.abs), 0.0001);

    const leader = sorted[0];
    const totalValue = states.reduce((a, s) => a + s.value, 0);
    const totalInvested = states.reduce((a, s) => a + s.invested, 0);
    const worst = sorted[sorted.length - 1];
    const bestSpread = leader && baseState ? leader.returnOnInvested - baseState.returnOnInvested : 0;

    return { sorted, spreads, scale, leader, worst, totalValue, totalInvested, bestSpread };
  }, [states, baseState]);

  // A comparison across unequal windows is the easiest way for a tracker to lie.
  const windows = states.map((s) => historyDays(s.dates));
  const minWindow = Math.min(...windows);
  const maxWindow = Math.max(...windows);
  const unequal = maxWindow - minWindow > 40;

  const rejected = states.flatMap((s) => s.rejected.map((r) => ({ name: s.name, r })));

  return (
    <div className="space-y-10">
      <section>
        <h1 className="figure text-[30px] leading-tight tracking-tight">After the close</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">
          {portfolioLine(states.length)} measured over {humanDate(states[0]?.dates[0] ?? "")} to{" "}
          {humanDate(index.lastDate)}. Same deposits, same start, different decisions.
        </p>
      </section>

      {/* Seeded example portfolios show real market history but not your decisions. */}
      {portfolios.some((p) => p.example) && (
        <div className="flex flex-wrap items-start gap-2 rounded-sm border-l-2 border-flag bg-flag/5 px-3.5 py-3 text-[12px] leading-relaxed text-flag">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <strong className="font-medium">These three are examples, not your decisions.</strong>{" "}
            They run real market history from {" "}
            {humanDate(portfolios.find((p) => p.example)?.startDate ?? "")} so you can see the
            paths diverge immediately — but the trades were seeded, not made by you. Start a fresh
            set dated today and the record becomes yours.
          </div>
          <button
            onClick={onStartFresh}
            className="shrink-0 rounded-sm border border-flag/40 bg-surface px-2.5 py-1.5 text-[11px] font-medium text-flag transition-colors duration-150 hover:border-flag"
          >
            Start fresh today
          </button>
        </div>
      )}

      {/* Headline figures: what you put in, what it is worth, and the spread that
          is the actual subject of the product. */}
      <section className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-rule py-6 md:grid-cols-4">
        <Figure label="Total put in" value={money(metrics.totalInvested)} />
        <Figure label="Worth today" value={money(metrics.totalValue)} />
        <Figure
          label="Overall return"
          value={signedPct(metrics.totalInvested > 0 ? metrics.totalValue / metrics.totalInvested - 1 : 0)}
          tone={metrics.totalValue >= metrics.totalInvested ? "gain" : "loss"}
        />
        <Figure
          label="Best vs baseline"
          value={signedPct(metrics.bestSpread)}
          sub={metrics.leader?.name}
          tone={metrics.bestSpread >= 0 ? "gain" : "loss"}
        />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium">The paths</h2>
          <span className="micro">{metricLabel(states.length)} · not inflation-adjusted</span>
        </div>
        <div className="rounded-sm border border-rule bg-surface p-4 sm:p-5">
          <PathChart states={states} baselineId={base} height={320} />
        </div>
      </section>

      {unequal && (
        <Notice tone="flag" icon={<AlertTriangle size={13} />}>
          These portfolios have different amounts of history (
          {windows.map((w, i) => `${states[i].name}: ${w}d`).join(", ")}). Comparing their returns
          directly is misleading — the shorter one has simply not lived through as much.
        </Notice>
      )}

      {rejected.length > 0 && (
        <Notice tone="loss" icon={<AlertTriangle size={13} />}>
          <strong className="font-medium">{rejected.length} trade(s) could not be filled</strong> and
          are excluded from every figure below.{" "}
          {rejected.slice(0, 3).map((r) => `${r.name}: ${r.r}`).join("; ")}
        </Notice>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium">Spread against the baseline</h2>
          <span className="micro">{baseState?.name ?? "—"} = 0</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="py-2 pr-3 font-medium text-muted">Portfolio</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Put in</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Worth</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Return</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Max drop</th>
                <th className="px-3 py-2 text-right font-medium text-muted">Vol</th>
                <th className="w-32 py-2 pl-3 text-right font-medium text-muted">vs baseline</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {metrics.sorted.map((s) => {
                const spread = s.returnOnInvested - (baseState?.returnOnInvested ?? 0);
                const isBase = s.id === base;
                return (
                  <tr
                    key={s.id}
                    className="group border-b border-rule/70 transition-colors duration-150 hover:bg-surface"
                  >
                    <td className="py-3 pr-3">
                      <Link to={`/p/${s.id}`} className="block">
                        <span className="font-medium">{s.name}</span>
                        {isBase && <span className="ml-2 text-[10px] text-accent">baseline</span>}
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                          {s.thesis}
                        </span>
                      </Link>
                    </td>
                    <td className="num px-3 py-3 text-muted">{money(s.invested)}</td>
                    <td className="num px-3 py-3 font-medium">{money(s.value)}</td>
                    <td
                      className={`num px-3 py-3 font-medium ${
                        s.returnOnInvested >= 0 ? "text-gain" : "text-loss"
                      }`}
                    >
                      {signedPct(s.returnOnInvested)}
                    </td>
                    <td className="num px-3 py-3 text-loss/90">{pct(s.maxDrawdown)}</td>
                    <td className="num px-3 py-3 text-muted">{pct(s.volatility)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <SpreadBar spread={spread} scale={metrics.scale} />
                        <span
                          className={`num w-14 shrink-0 text-[12px] ${
                            isBase ? "text-muted" : spread >= 0 ? "text-gain" : "text-loss"
                          }`}
                        >
                          {isBase ? "—" : signedPct(spread)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pl-2 text-right">
                      <Link
                        to={`/p/${s.id}`}
                        aria-label={`Open ${s.name}`}
                        className="inline-flex items-center text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-muted">
          <strong className="font-medium text-ink">Max drop</strong> is the deepest peak-to-trough
          fall along the path — the number that decides whether you would actually have held on.{" "}
          <strong className="font-medium text-ink">Vol</strong> is annualised daily volatility.
          Return alone ranks strategies; these two explain why the ranking is not the whole story.
        </p>
      </section>

      <section className="border-t border-rule pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium">Your portfolios</h2>
          <span className="micro">{portfolios.length} paths · trade from any detail view</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {metrics.sorted.map((s) => {
            const p = portfolios.find((x) => x.id === s.id);
            return (
              <Link
                key={s.id}
                to={`/p/${s.id}`}
                className="group rounded-sm border border-rule bg-surface p-4 transition-colors duration-150 hover:border-ink/25"
              >
                <div className="flex items-baseline justify-between">
                  <span className="figure text-[15px] font-medium">{s.name}</span>
                  <span
                    className={`num text-[12px] ${s.returnOnInvested >= 0 ? "text-gain" : "text-loss"}`}
                  >
                    {signedPct(s.returnOnInvested)}
                  </span>
                </div>
                <div className="num mt-2 figure text-[24px] tracking-tight">{money(s.value)}</div>
                <div className="mt-1 text-[11px] text-muted">
                  {p ? `$${p.monthly}/mo · since ${humanDate(p.startDate)}` : ""}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-rule pt-2 text-[11px] text-muted">
                  <span>{s.holdings.length} holdings</span>
                  <span className="text-accent opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    open →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div>
      <div className="micro">{label}</div>
      <div
        className={`num figure mt-1 text-[27px] leading-none tracking-tight ${
          tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function Notice({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: "flag" | "loss";
  icon: React.ReactNode;
}) {
  const c = tone === "flag" ? "border-flag bg-flag/5 text-flag" : "border-loss bg-loss/5 text-loss";
  return (
    <div className={`flex items-start gap-2 rounded-sm border-l-2 px-3.5 py-2.5 text-[12px] leading-relaxed ${c}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function portfolioLine(n: number) {
  if (n === 1) return "One portfolio";
  const words = ["Two", "Three", "Four", "Five", "Six"];
  return `${words[n - 2] ?? n} portfolios`;
}

function metricLabel(n: number) {
  return n > 1 ? "one line per portfolio" : "portfolio value";
}
