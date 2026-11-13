// Session handling across devices. Needs a confirmed throwaway account with no comparison:
//   CREDS="email password" npx tsx checks/session.check.ts   (with `npx vite preview --port 4173` running)
import { chromium, type Page } from "playwright-core";
const BASE = "http://localhost:4173/papertrades/";
const [EMAIL, PASSWORD] = process.env.CREDS!.split(" ");
const SB = "https://rolvlgtxjrcsczinhgbf.supabase.co";
const KEY = "sb_publishable_S_5S0pgWOiK-FXffZismrw_6MG6E3Ma";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });
const ok = (name: string, v: boolean) => console.log(v ? "ok  " : "FAIL", name);
async function signedIn(): Promise<Page> {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}signin`);
  await p.fill('input[type="email"]', EMAIL);
  await p.fill('input[type="password"]', PASSWORD);
  await p.click('button[type="submit"]');
  await p.getByText(/How much would you invest/).waitFor({ timeout: 60_000 });
  return p;
}
const a = await signedIn();
const bb = await signedIn();
await bb.click('button[aria-label="Sign out"]');
await bb.getByText(/Test your stock skills for free/).waitFor({ timeout: 15_000 });
await a.reload();
ok("signing out on one device keeps the other signed in", await a.getByText(/How much would you invest/).waitFor({ timeout: 60_000 }).then(() => true, () => false));

// End every session server-side, as a sign-out elsewhere (old app) or an admin would.
const token = await a.evaluate(() => { const k = Object.keys(localStorage).find((k) => k.includes("auth-token"))!; return JSON.parse(localStorage.getItem(k)!).access_token as string; });
const r = await fetch(`${SB}/auth/v1/logout?scope=global`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
console.log("global logout status", r.status);
await a.reload();
const toSignIn = await a.getByText(/Your session ended\. Please sign in again\./).waitFor({ timeout: 30_000 }).then(() => true, () => false);
ok("an ended session goes to sign-in with a note", toSignIn && a.url().endsWith("/signin"));
ok("no dead-end error page", !(await a.getByText(/Something didn't load/).isVisible()));
await a.fill('input[type="email"]', EMAIL);
await a.fill('input[type="password"]', PASSWORD);
await a.click('button[type="submit"]');
ok("signing back in works", await a.getByText(/How much would you invest/).waitFor({ timeout: 60_000 }).then(() => true, () => false));
await b.close();
