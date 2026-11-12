import { useState } from "react";
import { Lock } from "lucide-react";
import type { Account } from "@/lib/types";
import { signIn, signUp } from "@/lib/store";

type Props = { onAuth: (a: Account) => void; seedStart?: string };

export default function AuthPage({ onAuth, seedStart }: Props) {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const account =
        mode === "up"
          ? await signUp(email, name, secret, seedStart)
          : await signIn(email, secret);
      onAuth(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between border-r border-rule bg-paper px-12 py-10 lg:flex">
        <div className="figure text-[19px] font-semibold">Ledger</div>
        <div className="max-w-md">
          <h1 className="figure text-[42px] leading-[1.1] tracking-tight">
            The same dollars,
            <br />
            three different paths.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-muted">
            Run the boring index mix next to the concentrated bet and watch the gap between them
            open. After the close, in an evening, without a single flashing ticker.
          </p>
          <p className="mt-6 border-l-2 border-accent pl-4 text-[13px] leading-relaxed text-muted">
            The point is not to find the winning strategy. It is to see what your own urges
            would have cost you, on your own money, before it is real money.
          </p>
        </div>
        <div className="micro">Paper portfolios · no brokerage · no real money</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="figure text-[26px] tracking-tight">
            {mode === "up" ? "Open your ledger" : "Sign in"}
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            {mode === "up"
              ? "Three portfolios are set up for you to compare from day one."
              : "Welcome back."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block">
              <span className="micro">Email</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-sm border border-rule bg-surface px-3 py-2.5 text-sm"
              />
            </label>

            {mode === "up" && (
              <label className="block">
                <span className="micro">Name</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-rule bg-surface px-3 py-2.5 text-sm"
                />
              </label>
            )}

            <label className="block">
              <span className="micro">Password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="mt-1 w-full rounded-sm border border-rule bg-surface px-3 py-2.5 text-sm"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-sm border-l-2 border-loss bg-loss/5 px-3 py-2 text-xs text-loss">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent/90 active:translate-y-px disabled:opacity-50"
            >
              {busy ? "Working…" : mode === "up" ? "Open ledger" : "Sign in"}
            </button>
          </form>

          <button
            onClick={() => {
              setMode(mode === "up" ? "in" : "up");
              setError(null);
            }}
            className="mt-4 text-[12px] text-muted underline decoration-rule underline-offset-2 transition-colors hover:text-ink"
          >
            {mode === "up" ? "I already have an account" : "I need an account"}
          </button>

          <p className="mt-8 flex items-start gap-2 rounded-sm border border-rule bg-surface/60 px-3 py-2.5 text-[11px] leading-snug text-muted">
            <Lock size={12} className="mt-0.5 shrink-0" />
            <span>
              This account lives in this browser only. There is no server, so it will not sync to
              another device, and clearing site data deletes it. The password locks the ledger on
              this machine — it is not security against anyone using your browser profile.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
