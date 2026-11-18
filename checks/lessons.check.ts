// Lesson cards on the dashboard: "Got it" moves on, "Hide" collapses the
// section, and both are remembered on the account across a fresh sign-in.
// Needs a confirmed throwaway account with no comparison and no user_settings row:
//   CREDS="email password" npx tsx checks/lessons.check.ts   (with `npx vite preview --port 4173` running)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173/papertrades/";
const [EMAIL, PASSWORD] = process.env.CREDS!.split(" ");
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", name, detail ? `— ${detail}` : "");
};

const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });
const signIn = async (ctx: Awaited<ReturnType<typeof b.newContext>>) => {
  const page = await ctx.newPage();
  await page.goto(`${BASE}signin`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  return page;
};

let ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
let page = await signIn(ctx);
await page.getByText(/How much would you invest/).waitFor({ timeout: 60_000 });
await page.click('button:has-text("Next")');
await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });
await page.click('button:has-text("Start from today")');
await page.locator('[data-testid="lessons"]').waitFor({ timeout: 60_000 });

const count = () => page.innerText('[data-testid="lesson-count"]');
check("starts on lesson 1", (await count()) === "1 OF 50" || (await count()) === "1 of 50", await count());
check("the lessons sit above the portfolios", await page.evaluate(() => {
  const l = document.querySelector('[data-testid="lessons"]')!, p = document.getElementById("portfolios-title")!;
  return !!(l.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING);
}));
await page.screenshot({ path: "checks/out/lessons.png" });
await page.click('[data-testid="lesson-got-it"]');
await page.click('[data-testid="lesson-got-it"]');
check("Got it moves on", /^3 of 50$/i.test(await count()), await count());
check("…to lesson 3's card", (await page.innerText('[data-testid="lesson-card"] h3')) === "Tickers");

await page.click('[data-testid="lessons-toggle"]');
check("Hide collapses the section", (await page.locator('[data-testid="lesson-card"]').count()) === 0);
check("…leaving a Show toggle", (await page.innerText('[data-testid="lessons-toggle"]')).trim() === "Show");
await page.waitForTimeout(1500);
await page.screenshot({ path: "checks/out/lessons-hidden.png" });
await ctx.close();

// A fresh browser (new sign-in) keeps it hidden and on lesson 3.
ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
page = await signIn(ctx);
await page.locator('[data-testid="lessons-toggle"]').waitFor({ timeout: 60_000 });
check("still hidden after signing in again", (await page.locator('[data-testid="lesson-card"]').count()) === 0);
await page.click('[data-testid="lessons-toggle"]');
check("Show brings back the same lesson", (await page.innerText('[data-testid="lesson-card"] h3')) === "Tickers");
await page.locator('[data-testid="lessons"]').screenshot({ path: "checks/out/lessons-phone.png" });
await page.waitForTimeout(1500);

await b.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
