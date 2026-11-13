import type { Account, AccountData, Portfolio, Tx } from "@/lib/types";
import { nyDate } from "@/lib/market";

/**
 * Storage layer.
 *
 * IMPORTANT, and deliberately surfaced in the UI: this build has no server
 * database. Accounts and portfolios live in this browser's localStorage only.
 * That means: no sync across devices, clearing site data deletes everything, and
 * the "password" is a local lock rather than real authentication. It is enough to
 * keep a shared laptop from opening your ledger - it is not security against
 * anyone with access to the browser profile.
 *
 * The shape below is intentionally what a real backend would store, so swapping
 * in the managed Postgres later is a data-layer change, not a rewrite.
 */

const ROOT = "ledger.v1";
const SESSION = "ledger.v1.session";

type Root = {
  accounts: Account[];
  data: Record<string, AccountData>;
};

function emptyRoot(): Root {
  return { accounts: [], data: {} };
}

function read(): Root {
  try {
    const raw = localStorage.getItem(ROOT);
    if (!raw) return emptyRoot();
    const parsed = JSON.parse(raw) as Root;
    if (!parsed.accounts || !parsed.data) return emptyRoot();
    return parsed;
  } catch {
    return emptyRoot();
  }
}

function write(root: Root) {
  localStorage.setItem(ROOT, JSON.stringify(root));
}

async function digest(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signUp(
  email: string,
  name: string,
  secret: string,
  seedStart?: string,
): Promise<Account> {
  const root = read();
  const key = email.trim().toLowerCase();
  if (!key.includes("@")) throw new Error("Enter an email address.");
  if (secret.length < 6) throw new Error("Use at least 6 characters.");
  if (root.accounts.some((a) => a.email === key)) {
    throw new Error("An account with that email already exists on this device.");
  }
  const account: Account = {
    id: crypto.randomUUID(),
    email: key,
    name: name.trim() || key.split("@")[0],
    secret: await digest(`${key}:${secret}`),
    createdAt: new Date().toISOString(),
  };
  root.accounts.push(account);
  root.data[account.id] = { account, portfolios: starterPortfolios(seedStart) };
  write(root);
  localStorage.setItem(SESSION, account.id);
  return account;
}

export async function signIn(email: string, secret: string): Promise<Account> {
  const root = read();
  const key = email.trim().toLowerCase();
  const account = root.accounts.find((a) => a.email === key);
  if (!account) throw new Error("No account with that email on this device.");
  const hash = await digest(`${key}:${secret}`);
  if (hash !== account.secret) throw new Error("That password does not match.");
  localStorage.setItem(SESSION, account.id);
  return account;
}

export function signOut() {
  localStorage.removeItem(SESSION);
}

export function currentAccount(): Account | null {
  const id = localStorage.getItem(SESSION);
  if (!id) return null;
  const root = read();
  return root.accounts.find((a) => a.id === id) ?? null;
}

export function loadData(accountId: string): AccountData | null {
  return read().data[accountId] ?? null;
}

export function saveData(data: AccountData) {
  const root = read();
  root.data[data.account.id] = data;
  write(root);
}

export function nextId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Replace the seeded examples with a clean set starting today.
 * Anything the user built themselves is left alone.
 */
export function startFresh(data: AccountData, now: Date = new Date()): AccountData {
  const mine = data.portfolios.filter((p) => !p.example);
  const placedAt = now.toISOString();
  const today = nyDate(now);
  // The starter buys become real orders: they fill at the next close, like
  // any other decision made today.
  const fresh = starterPortfolios(today).map((p) => ({
    ...p,
    example: false,
    tx: p.tx.map((t) => ({ ...t, placedAt })),
  }));
  return { ...data, portfolios: [...mine, ...fresh] };
}

/**
 * Three starter portfolios that make the product's point immediately: the same
 * dollars, three different convictions.
 *
 * These are seeded with real market history so the first visit is not three flat
 * lines - but they are marked `example: true`, because they are market fact, not
 * your decisions. The UI labels them and offers a clean start on today's date.
 */
export function starterPortfolios(seedDate?: string): Portfolio[] {
  const today = seedDate ?? new Date().toISOString().slice(0, 10);
  // Seeded sets are always marked as examples; `startFresh` clears the flag when
  // the user asks for a clean start on their own date.
  const base = { startDate: today, initial: 10_000, monthly: 500, example: true };
  return [
    {
      ...base,
      id: nextId("pf"),
      name: "Boring index mix",
      thesis: "Own the whole market and do nothing. The baseline every other path is measured against.",
      weights: { VTI: 0.6, BND: 0.4 },
      tx: [
        { id: nextId("tx"), kind: "buy", date: today, ticker: "VTI", amount: 6000 },
        { id: nextId("tx"), kind: "buy", date: today, ticker: "BND", amount: 4000 },
      ],
    },
    {
      ...base,
      id: nextId("pf"),
      name: "Chip-heavy",
      thesis: "Concentrated in semiconductors because the growth story feels obvious right now.",
      weights: { SMH: 0.5, NVDA: 0.5 },
      tx: [
        { id: nextId("tx"), kind: "buy", date: today, ticker: "SMH", amount: 5000 },
        { id: nextId("tx"), kind: "buy", date: today, ticker: "NVDA", amount: 5000 },
      ],
    },
    {
      ...base,
      id: nextId("pf"),
      name: "Healthcare",
      thesis: "Defensive and dull on purpose: people get sick in every kind of market.",
      weights: { XLV: 0.6, LLY: 0.4 },
      tx: [
        { id: nextId("tx"), kind: "buy", date: today, ticker: "XLV", amount: 6000 },
        { id: nextId("tx"), kind: "buy", date: today, ticker: "LLY", amount: 4000 },
      ],
    },
  ];
}

export type { Tx, Portfolio };
