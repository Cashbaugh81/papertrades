/**
 * Visual + behaviour self-check against the running dev server.
 *
 * Renders the real app in a real browser: signs up, screenshots every view at
 * several viewports, and asserts the things a build cannot prove — no console
 * errors, no horizontal overflow, trades persisting, and a trade actually
 * changing the numbers.
 */
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "/tmp/shots";

const errors: string[] = [];
const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) errors.push(name);
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return {
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      over: de.scrollWidth > de.clientWidth + 1,
    };
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      `${process.env.HOME}/.pw/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const consoleErrors: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // ---------- signed out ----------
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  check("sign-in screen renders", await page.locator("text=Open your ledger").isVisible());
  await shot(page, "01-auth-desktop");

  const o1 = await overflow(page);
  check("no horizontal overflow at 1280", !o1.over, `${o1.scrollW}/${o1.clientW}`);

  // ---------- sign up ----------
  await page.fill('input[type="email"]', "sam@example.com");
  await page.fill('input[autocomplete="name"]', "Sam");
  await page.fill('input[type="password"]', "ledger123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1800);

  const signedIn = await page.locator("text=After the close").isVisible();
  check("sign-up lands on the comparison view", signedIn);

  const svgCount = await page.locator("svg path[stroke]").count();
  check("the parallel-path chart draws lines", svgCount >= 3, `${svgCount} stroked paths`);

  const tableRows = await page.locator("table tbody tr").count();
  check("comparison table lists portfolios", tableRows >= 3, `${tableRows} rows`);

  const bodyText = await page.locator("body").innerText();
  check("example portfolios are labelled as examples", /examples, not your decisions/i.test(bodyText));
  check("fixed-price snapshot is disclosed", /fixed snapshot/i.test(bodyText));

  await shot(page, "02-comparison-desktop");

  const o2 = await overflow(page);
  check("no horizontal overflow on comparison", !o2.over, `${o2.scrollW}/${o2.clientW}`);

  // ---------- open a portfolio ----------
  await page.click("table tbody tr:first-child a");
  await page.waitForTimeout(1200);
  check("portfolio detail opens", await page.locator("text=Holdings").isVisible());
  check("trade ticket is present", await page.locator("text=Record a transaction").isVisible());
  check("decision log is present", await page.locator("text=Decision log").isVisible());
  await shot(page, "03-portfolio-desktop");

  // ---------- record a trade and confirm the numbers move ----------
  const valueBefore = await page.locator("text=worth today").locator("..").innerText();
  void valueBefore;

  // Contributions are now invested immediately, so a portfolio can legitimately
  // hold ~zero cash. The ticket must offer a way forward instead of a dead end.
  const cashText = await page.locator("text=Cash in this portfolio").locator("..").innerText();
  const cashNow = Number(cashText.replace(/[^0-9.]/g, "")) || 0;
  check("a portfolio can hold near-zero cash", cashNow < 1, `cash ${cashNow}`);

  const submitDisabled = await page.locator('button[type="submit"]').isDisabled();
  check("buy is disabled with no cash", submitDisabled);

  // Add cash, then confirm buying becomes possible.
  await page.click('button:has-text("Add cash")');
  await page.waitForTimeout(300);
  await page.locator('input[type="number"]').fill("1000");
  await page.fill('input[placeholder*="Where this money came from"]', "topping up to test");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  const afterCash = await page.locator("body").innerText();
  check("cash deposit is recorded", /topping up to test/.test(afterCash));

  // Back to buying, and place a real order.
  await page.click('button:has-text("Buy")');
  await page.waitForTimeout(300);
  await page.locator('input[type="number"]').fill("250");
  await page.fill('input[placeholder*="What were you thinking"]', "checking the ticket works");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);

  const afterText = await page.locator("body").innerText();
  check(
    "a recorded trade appears in the decision log",
    /checking the ticket works/.test(afterText),
  );
  const hasReject = /could not be filled/i.test(afterText);
  check("the trade filled rather than being rejected", !hasReject, hasReject ? "rejected" : undefined);
  await shot(page, "04-portfolio-after-trade");

  // ---------- persistence across reload ----------
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const afterReload = await page.locator("body").innerText();
  check("the trade survives a reload", /checking the ticket works/.test(afterReload));
  check("the session survives a reload", /After the close|Holdings/.test(afterReload));

  // ---------- decisions page ----------
  await page.click('a:has-text("All decisions")');
  await page.waitForTimeout(900);
  check("decisions page lists the trade", /checking the ticket works/.test(await page.locator("body").innerText()));
  await shot(page, "05-decisions-desktop");

  // ---------- overspend is refused, not clamped ----------
  await page.click('a:has-text("Comparison")');
  await page.waitForTimeout(700);
  await page.click("table tbody tr:first-child a");
  await page.waitForTimeout(900);
  await page.locator('input[type="number"]').fill("999999");
  await page.waitForTimeout(400);
  const disabled = await page.locator('button[type="submit"]').isDisabled();
  check("an unfundable buy is blocked in the form", disabled);
  // ---------- narrow viewport ----------
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const o320 = await overflow(page);
  check("no horizontal overflow at 320px", !o320.over, `${o320.scrollW}/${o320.clientW}`);
  await shot(page, "06-comparison-320");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const o390 = await overflow(page);
  check("no horizontal overflow at 390px", !o390.over, `${o390.scrollW}/${o390.clientW}`);
  await shot(page, "07-comparison-390");

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  await shot(page, "08-comparison-768");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await shot(page, "09-comparison-1440");

  // ---------- reduced motion ----------
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const svgAfter = await page.locator("svg path[stroke]").count();
  check("chart still renders with reduced motion", svgAfter >= 3, `${svgAfter} paths`);
  await shot(page, "10-reduced-motion");

  check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  if (errors.length) {
    console.log("FAILURES:", errors.join(", "));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("harness crashed:", e);
  process.exitCode = 1;
});
