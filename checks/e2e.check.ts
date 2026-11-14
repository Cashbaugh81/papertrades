/**
 * End-to-end check against the live Supabase project.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   E2E_EMAIL=... E2E_PASSWORD=... npx tsx checks/e2e.check.ts
 *
 * Needs a confirmed account with no comparison yet (a throwaway one: it
 * creates comparisons, changes mixes and adds columns). CHROME defaults to
 * /usr/bin/google-chrome. Screenshots go to checks/out/.
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173/papertrades/";
const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const OUT = "checks/out";
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

async function waitForText(page: Page, re: RegExp, timeout = 60_000) {
  try {
    await page.waitForFunction((src) => new RegExp(src, "i").test(document.body.innerText), re.source, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitForNoText(page: Page, re: RegExp, timeout = 20_000) {
  try {
    await page.waitForFunction((src) => !new RegExp(src, "i").test(document.body.innerText), re.source, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function signIn(page: Page) {
  await page.goto(`${BASE}signin`);
  await page.waitForSelector('input[type="password"]', { timeout: 30_000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
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
  const badResponses: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && badResponses.push(`${r.status()} ${r.url().split("?")[0]}`));

  // ---- landing page -----------------------------------------------------------
  await page.goto(BASE);
  check("landing page shows", await waitForText(page, /Test your stock skills for free/));
  check("it opens on January 2020", await waitForText(page, /Day one/, 5_000));
  check("after 5 seconds it moves to the next moment", await waitForText(page, /Just after the COVID crash/, 7_000));
  await page.click('[data-testid="moment-play"]');
  await page.waitForTimeout(6_000);
  check("pause stops the replay", await page.getByText("Just after the COVID crash").isVisible());
  await page.click('[data-testid="moment-play"]');
  check("three portfolios with photos", (await page.locator('[data-testid="landing-col"] img').count()) === 3);
  await page.locator('[data-testid="landing-col"]').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid="landing-col"] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15_000 }).catch(() => {});
  check("photos load", await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid="landing-col"] img')].every((i) => i.naturalWidth > 0)));
  await page.screenshot({ path: `${OUT}/0-landing-1280.png`, fullPage: true });
  await page.click('button:has-text("Oct 2022")');
  check("picking a moment changes the story", await waitForText(page, /The long slide/, 5_000));
  check("the chip mix shows its worth then", /\$30,814/.test(await page.locator('[data-testid="landing-worth"]').nth(1).innerText()));
  await page.click('button[aria-label="Later moment"]');
  check("the arrow steps forward", await waitForText(page, /The summer scare/, 5_000));
  await page.click('button:has-text("Nov 2026")');
  check("after the last moment it starts again from January 2020", await waitForText(page, /Day one/, 7_000));
  check("the new pill leads to sign-up", (await page.getAttribute('[data-testid="moment-cta"]', "href"))?.endsWith("/start") ?? false);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.waitForTimeout(300);
  const landOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("landing has no sideways scroll at 320px", landOverflow <= 1, `${landOverflow}px`);
  await page.screenshot({ path: `${OUT}/0-landing-320.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.locator('a:has-text("Start with pretend money")').first().click();
  check("the call to action opens sign-up", await waitForText(page, /Create|Open ledger/, 10_000) && page.url().endsWith("/start"));
  await page.locator('a:has-text("Ledger")').first().click();
  check("the wordmark goes back to the landing page", await waitForText(page, /Test your stock skills for free/, 10_000));
  await page.click('nav a:has-text("Sign in")');

  // ---- sign in ---------------------------------------------------------------
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
  check("sign-in page shows", page.url().endsWith("/signin"));
  await page.fill('input[type="email"]', "nobody@test.invalid");
  await page.fill('input[type="password"]', "wrong-password-123");
  await page.click('button[type="submit"]');
  check("a wrong password is refused", await waitForText(page, /don't match an account/, 15_000));
  await signIn(page);

  // ---- onboarding: amounts -----------------------------------------------------
  check("onboarding asks for amounts", await waitForText(page, /How much would you invest/, 60_000));
  await page.fill("#amount", "0");
  await page.fill("#weekly", "0");
  await page.click('button:has-text("Next")');
  check("zero and zero is refused", await waitForText(page, /starting amount, a weekly amount, or both/, 5_000));
  await page.fill("#amount", "10000");
  await page.fill("#weekly", "100");
  await page.click('button:has-text("Next")');

  // ---- setup: start date and three columns ------------------------------------
  check("setup shows the start date", await waitForText(page, /Portfolio start date/, 10_000));
  check("Today is selected", await page.locator('input[type="radio"]').first().isChecked());
  check(
    "portfolio 1 is VTI 100%",
    (await page.inputValue('[data-testid="setup-1-ticker-0"]')) === "VTI" &&
      (await page.inputValue('[data-testid="setup-1-pct-0"]')) === "100",
  );
  check(
    "portfolios 2 and 3 start blank",
    (await page.inputValue('[data-testid="setup-2-ticker-0"]')) === "" &&
      (await page.inputValue('[data-testid="setup-3-ticker-0"]')) === "",
  );
  await page.screenshot({ path: `${OUT}/1-setup.png`, fullPage: true });

  // Portfolio 2: a mix. A typo first, then a wrong total, then the real thing.
  await page.fill('[data-testid="setup-2-ticker-0"]', "NVDA");
  await page.fill('[data-testid="setup-2-pct-0"]', "50");
  await page.click('[data-testid="setup-col-2"] button:has-text("Add another")');
  await page.fill('[data-testid="setup-2-ticker-1"]', "ZZZZQX");
  check("an unknown ticker is reported", await waitForText(page, /not found|no ticker called ZZZZQX/, 45_000));
  await page.fill('[data-testid="setup-2-ticker-1"]', "SMH");
  await page.fill('[data-testid="setup-2-pct-1"]', "40");
  check("a mix that doesn't add to 100 is flagged", await waitForText(page, /add up to 90%/, 30_000));
  await page.fill('[data-testid="setup-2-pct-1"]', "50");
  await waitForNoText(page, /checking…/, 45_000);
  await page.click('button:has-text("Start from today")');

  // ---- the dashboard -------------------------------------------------------------
  check("dashboard shows a live record", await waitForText(page, /Live record/, 60_000));
  check("portfolio 1 waits for the next close", await waitForText(page, /Waiting for the next market close/, 10_000));
  check("portfolio 2 shows its mix", /NVDA 50% · SMH 50%/.test(await page.innerText('[data-testid="col-2-mix"]')));
  check("portfolio 3 is empty and offered", (await page.locator('[data-testid="col-3-empty"]').count()) === 1);
  check("each starts with $10,000", /\$10,000/.test(await page.innerText('[data-testid="col-1-value"]')));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/2-dashboard-live.png`, fullPage: true });

  // ---- add portfolio 3 ---------------------------------------------------------------
  await page.click('[data-testid="col-3-empty"] button:has-text("Choose what to compare")');
  await page.fill('[data-testid="add-3-ticker-0"]', "QQQ");
  await waitForNoText(page, /checking…/, 45_000);
  await page.click('button:has-text("Add portfolio")');
  check("portfolio 3 added", await waitForText(page, /QQQ 100%/, 20_000));

  // ---- change a mix, then cancel it ------------------------------------------------
  await page.click('[data-testid="col-2"] button:has-text("Change mix")');
  await page.click('[data-testid="col-2"] button[aria-label="Remove ticker 2"]');
  await page.fill('[data-testid="edit-2-pct-0"]', "100");
  await page.fill('[data-testid="col-2"] input[placeholder^="Why?"]', "e2e: all in on one");
  await page.click('button:has-text("Change at next close")');
  check("the mix change is pending", await waitForText(page, /Moving to NVDA 100% at the next close/, 20_000));
  check("the decision log records it with its note", await waitForText(page, /changed to\s+NVDA 100%[\s\S]*all in on one/, 10_000));
  await page.click('[data-testid="col-2"] button:has-text("Cancel")');
  check("cancelling removes it", await waitForNoText(page, /Moving to NVDA 100%/, 20_000));

  // ---- a past start date: a what-if ----------------------------------------------------
  await page.click('button:has-text("Change start date")');
  check("changing the date keeps the mixes", (await page.inputValue('[data-testid="setup-2-ticker-0"]')) === "NVDA");
  await page.locator('input[type="radio"]').nth(1).check();
  await page.fill('input[aria-label="Start date"]', "2001-01-02");
  check("a date before VTI existed is caught", await waitForText(page, /VTI only has prices from/, 20_000));
  await page.fill('input[aria-label="Start date"]', "2020-01-02");
  await waitForNoText(page, /checking…/, 45_000);
  await page.click('button:has-text("Run the what-if")');
  check("the what-if is labelled", await waitForText(page, /What-if: chosen with hindsight/, 60_000));
  await page.waitForTimeout(1500);
  const v1 = await page.innerText('[data-testid="col-1-value"]');
  const v2 = await page.innerText('[data-testid="col-2-value"]');
  const n = (s: string) => Number(s.replace(/[^0-9]/g, ""));
  check("what-if columns have grown past what was put in (~$45k)", n(v1) > 45_000 && n(v2) > 45_000, `${v1} / ${v2}`);
  check("all three portfolios carried over", /QQQ 100%/.test(await page.innerText('[data-testid="col-3-mix"]')));
  await page.screenshot({ path: `${OUT}/3-dashboard-whatif.png`, fullPage: true });
  check("cards say Cash invested", await page.getByText("Cash invested").first().isVisible());
  const worthBox = await page.locator('[data-testid="col-1-value"]').boundingBox();
  const gainBox = await page.locator('[data-testid="col-1-gain"]').boundingBox();
  check("the gain sits next to the worth", !!worthBox && !!gainBox && gainBox.x > worthBox.x + worthBox.width - 1 && Math.abs(gainBox.y + gainBox.height - (worthBox.y + worthBox.height)) < 12);
  const legend = await page.locator('[data-testid^="legend-"]').allInnerTexts();
  check("the chart legend names portfolios by number", legend.length === 3 && legend.every((t, i) => t.includes(`Portfolio ${i + 1}`)), legend.join(" | "));
  await page.locator('[data-testid^="legend-"]').nth(1).hover();
  const tip = await page.locator('[role="tooltip"]').innerText().catch(() => "");
  check("hovering a legend entry lists its mix", /NVDA\s+50%/.test(tip) && /SMH\s+50%/.test(tip), tip.replace(/\s+/g, " "));
  await page.screenshot({ path: `${OUT}/3-legend-hover.png` , fullPage: true });
  await page.mouse.move(0, 0);

  // ---- stored on the server ------------------------------------------------------------
  await page.reload();
  check("after a reload the what-if is still there", await waitForText(page, /What-if: chosen with hindsight/, 60_000));
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const other = await ctx2.newPage();
  await signIn(other);
  check("a second browser sees the same comparison", await waitForText(other, /What-if: chosen with hindsight/, 60_000));
  await ctx2.close();

  // ---- narrow screen ---------------------------------------------------------------------
  await page.setViewportSize({ width: 320, height: 900 });
  await page.waitForTimeout(800);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("no sideways scroll at 320px", overflow <= 1, `${overflow}px`);
  await page.screenshot({ path: `${OUT}/4-dashboard-320.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 1000 });

  // ---- start over goes back to onboarding ---------------------------------------------
  await page.click('button:has-text("Start over")');
  check("start over asks for amounts again", await waitForText(page, /How much would you invest/, 10_000));
  await page.click('button:has-text("Cancel")');
  check("cancel returns to the comparison", await waitForText(page, /What-if: chosen with hindsight/, 10_000));

  await page.click('button[aria-label="Sign out"]');
  check("sign out returns to the landing page", await waitForText(page, /Test your stock skills for free/, 15_000));

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
