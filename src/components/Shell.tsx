import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import type { Account } from "@/lib/types";
import { humanDate } from "@/lib/ledger";

type Props = {
  account: Account;
  asOf: string;
  onSignOut: () => void;
  children: ReactNode;
  stale?: boolean;
};

export default function Shell({ account, asOf, onSignOut, children, stale }: Props) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/95 backdrop-blur-[2px]">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-6 py-3">
          <Link to="/" className="group flex items-baseline gap-2.5">
            <span className="figure text-[19px] font-semibold tracking-tight">Ledger</span>
            <span className="hidden text-[11px] text-muted sm:inline">
              the same dollars, different paths
            </span>
          </Link>

          <div className="flex items-center gap-4 text-xs">
            <div className="hidden text-right leading-tight sm:block">
              <div className="micro">data through</div>
              <div className="num text-[12px] font-medium">{humanDate(asOf)}</div>
            </div>
            <span className="hidden h-6 w-px bg-rule sm:block" />
            <div className="hidden text-right leading-tight md:block">
              <div className="micro">account</div>
              <div className="text-[12px]">{account.name}</div>
            </div>
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 rounded-sm border border-rule px-2.5 py-1.5 text-muted transition-colors duration-150 hover:border-ink/30 hover:text-ink"
              aria-label="Sign out"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-[1080px] items-center gap-1 px-6">
          <Tab to="/" active={pathname === "/"} label="Comparison" />
          <Tab to="/decisions" active={pathname === "/decisions"} label="All decisions" />
        </nav>
      </header>

      {stale && (
        <div className="border-b border-flag/25 bg-flag/8">
          <div className="mx-auto flex max-w-[1080px] items-start gap-2 px-6 py-2 text-[12px] leading-snug text-flag">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-flag" />
            <span>
              Prices are a fixed snapshot, not a live feed. This build ships daily closes
              through {humanDate(asOf)} and nothing refreshes on its own yet. Orders placed now
              stay pending until a later close is added.
            </span>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1080px] px-6 pb-24 pt-8">{children}</main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-[1080px] px-6 py-6 text-[11px] leading-relaxed text-muted">
          Paper portfolios only. No brokerage connection, no real orders, no real money.
          Accounts and trades are stored in this browser alone — not synced, not backed up.
        </div>
      </footer>
    </div>
  );
}

function Tab({ to, active, label }: { to: string; active: boolean; label: string }) {
  return (
    <Link
      to={to}
      className={`-mb-px border-b-2 px-3 py-2 text-[12px] transition-colors duration-150 ${
        active
          ? "border-accent font-medium text-ink"
          : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
