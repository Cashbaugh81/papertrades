/**
 * End-to-end check against the live Supabase project.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   E2E_EMAIL=... E2E_PASSWORD=... npx tsx checks/e2e.check.ts
 *
 * Needs a confirmed account with no portfolios. Ideally a throwaway one,
 * because it seeds examples, starts fresh, places and cancels orders.
 * CHROME defaults to /usr/bin/google-chrome. Screenshots go to checks/out/.
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173";
const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const OUT = "checks/out";
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

async function text(page: Page) {
  return page.locator("body").innerText();
}

async function waitForText(page: Page, re: RegExp, timeout = 60_000) {
  try {
    await page.waitForFunction((src) => new RegExp(src, "i").test(document.body.innerText), re.source, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("set E2E_EMAIL and E2E_PASSWORD");
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--headless=new"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: "America/Los_Angeles" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // Record which request failed, so an expected one (the deliberate wrong
  // password below) can be told apart from a real problem.
  const badResponses: string[] = [];
  page.on("response", (r) => r.status() >= 400 && badResponses.push(`${r.status()} ${r.url().split("?")[0]}`));

  // ---- sign in -----------------------------------------------------------
  await page.goto(BASE);
  check("auth page shows", await waitForText(page, /Sign in/));
  check("auth copy no longer claims browser-only storage", !/this browser only/i.test(await text(page)));
  await page.fill('input[type="email"]', "nobody@test.invalid");
  await page.fill('input[type="password"]', "wrong-password-123");
  await page.click('button[type="submit"]');
  check("a wrong password is refused", await waitForText(page, /don't match an account/, 15_000));

  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  // ---- first visit: examples are seeded ----------------------------------
  check("examples are seeded and labelled", await waitForText(page, /examples, not your decisions/, 90_000));
  const links = await page.locator('a[href*="/p/"]').count();
  check("three portfolios listed", links >= 3, `${links} links`);
  await page.waitForTimeout(1200); // let the chart's 620ms reveal finish
  await page.screenshot({ path: `${OUT}/1-examples.png`, fullPage: true });

  // ---- start fresh: real portfolios with pending orders -------------------
  await page.click('button:has-text("Start fresh today")');
  check("start fresh removes the example label", await waitForText(page, /^(?![\s\S]*examples, not your decisions)/, 30_000));
  await page.locator('a[href*="/p/"]').first().click();
  check("fresh portfolio shows orders waiting to fill", await waitForText(page, /Waiting to fill/, 30_000));
  const t1 = await text(page);
  check("starter orders are pending, not filled", /PENDING/.test(t1) && !/Bought/.test(t1));
  await page.screenshot({ path: `${OUT}/2-fresh-portfolio.png`, fullPage: true });

  // ---- add cash -----------------------------------------------------------
  await page.click('button:has-text("Add cash")');
  await page.locator('input[type="number"]').fill("1000");
  await page.click('button[type="submit"]:has-text("Add $1,000")');
  check("deposit lands: $1,000 free", await waitForText(page, /Cash free \(after pending orders\)\s*\$1,000\.00/, 20_000));

  // ---- a ticker nobody has loaded yet ------------------------------------
  await page.click('button:has-text("Buy")');
  const tickerBox = page.locator('input[list="ticker-suggestions"]');
  await tickerBox.fill("ZZZZQX");
  check("an unknown ticker is reported", await waitForText(page, /No ticker called ZZZZQX/, 30_000));
  await tickerBox.fill("MSFT");
  check("a new ticker is looked up live", await waitForText(page, /MSFT last closed at \$/, 60_000));
  await page.locator('input[type="number"]').fill("400");
  await page.fill('input[placeholder*="What were you thinking"]', "e2e: testing a live lookup");
  await page.click('button[type="submit"]:has-text("Place order")');
  check("the MSFT order is pending", await waitForText(page, /Buy\s*MSFT/, 20_000));
  check("its cash is held back", await waitForText(page, /Cash free \(after pending orders\)\s*\$600\.00/, 20_000));

  // ---- cancel it ------------------------------------------------------------
  const before = await page.locator('button:has-text("cancel")').count();
  await page.locator('tr:has-text("MSFT") button:has-text("cancel")').click();
  await page.waitForTimeout(2500);
  const after = await page.locator('button:has-text("cancel")').count();
  check("cancelling removes the pending order", after === before - 1, `${before} → ${after}`);
  check("cash is free again", await waitForText(page, /Cash free \(after pending orders\)\s*\$1,000\.00/, 20_000));

  // ---- it's stored on the server, not in the tab --------------------------
  await page.reload();
  check("after a reload the session and data are still there", await waitForText(page, /Waiting to fill/, 60_000));
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const other = await ctx2.newPage();
  await other.goto(BASE);
  await waitForText(other, /Sign in/);
  await other.fill('input[type="email"]', EMAIL);
  await other.fill('input[type="password"]', PASSWORD);
  await other.click('button[type="submit"]');
  check("a second browser sees the same portfolios", await waitForText(other, /Boring index mix/, 60_000));
  check("the second browser doesn't re-seed examples", !/examples, not your decisions/i.test(await text(other)));
  await ctx2.close();

  // ---- narrow screen ---------------------------------------------------------
  await page.setViewportSize({ width: 320, height: 900 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("no sideways scroll at 320px", overflow <= 1, `${overflow}px`);
  await page.screenshot({ path: `${OUT}/3-portfolio-320.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 1000 });

  // ---- sign out ----------------------------------------------------------------
  await page.click('button[aria-label="Sign out"]');
  check("sign out returns to the sign-in page", await waitForText(page, /Sign in/, 15_000));

  // The wrong-password attempt is expected to produce one 400 from /auth/v1/token.
  const unexpected = badResponses.filter((r) => !/^400 .*\/auth\/v1\/token$/.test(r));
  check("no failed requests except the deliberate bad sign-in", unexpected.length === 0, unexpected.join(" | ") || badResponses.join(" | "));
  const real = errors.filter((e) => !/favicon|status of 400/i.test(e));
  check("no other console errors", real.length === 0, real.slice(0, 3).join(" | "));
  await browser.close();

  console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
