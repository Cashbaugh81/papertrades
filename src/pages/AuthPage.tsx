import { useState } from "react";
import { Lock } from "lucide-react";
import { sendPasswordReset, setNewPassword, signIn, signUp } from "@/lib/api";

type Mode = "up" | "in" | "forgot" | "reset";

type Props = {
  /** "reset" when the user arrived from a password-reset email. */
  initialMode?: Mode;
  /** Called after a new password is saved in "reset" mode. */
  onResetDone?: () => void;
};

export default function AuthPage({ initialMode = "in", onResetDone }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "up") {
        const r = await signUp(email, secret, name);
        if (r === "confirm-email") {
          setNotice(`Check ${email.trim()} for a confirmation link, then sign in.`);
          setMode("in");
          setSecret("");
        }
      } else if (mode === "in") {
        await signIn(email, secret);
      } else if (mode === "forgot") {
        await sendPasswordReset(email);
        setNotice(`If ${email.trim()} has an account, a reset link is on its way.`);
      } else {
        await setNewPassword(secret);
        onResetDone?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const title = { up: "Open your ledger", in: "Sign in", forgot: "Reset your password", reset: "Choose a new password" }[mode];
  const subtitle = {
    up: "Three example portfolios are set up for you to compare from day one.",
    in: "Welcome back.",
    forgot: "We'll email you a link to set a new one.",
    reset: "You followed a reset link. Set a new password to continue.",
  }[mode];
  const cta = { up: "Open ledger", in: "Sign in", forgot: "Send reset link", reset: "Save password" }[mode];

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
          <div className="figure mb-6 text-[19px] font-semibold lg:hidden">Ledger</div>
          <h2 className="figure text-[26px] tracking-tight">{title}</h2>
          <p className="mt-1 text-[13px] text-muted">{subtitle}</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode !== "reset" && (
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
            )}

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

            {mode !== "forgot" && (
              <label className="block">
                <span className="micro">{mode === "reset" ? "New password" : "Password"}</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-rule bg-surface px-3 py-2.5 text-sm"
                />
              </label>
            )}

            {notice && (
              <p role="status" className="rounded-sm border-l-2 border-gain bg-gain/5 px-3 py-2 text-xs text-ink">
                {notice}
              </p>
            )}
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
              {busy ? "Working…" : cta}
            </button>
          </form>

          {mode !== "reset" && (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[12px]">
              {mode !== "in" && <SwitchLink onClick={() => go("in")}>I already have an account</SwitchLink>}
              {mode !== "up" && <SwitchLink onClick={() => go("up")}>I need an account</SwitchLink>}
              {mode === "in" && <SwitchLink onClick={() => go("forgot")}>Forgot password?</SwitchLink>}
            </div>
          )}

          <p className="mt-8 flex items-start gap-2 rounded-sm border border-rule bg-surface/60 px-3 py-2.5 text-[11px] leading-snug text-muted">
            <Lock size={12} className="mt-0.5 shrink-0" />
            <span>
              Your portfolios are stored in your account and sync across devices. Paper money only:
              there is no brokerage connection.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function SwitchLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted underline decoration-rule underline-offset-2 transition-colors hover:text-ink"
    >
      {children}
    </button>
  );
}
