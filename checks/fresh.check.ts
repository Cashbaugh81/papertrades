/**
 * Verifies the two affordances added late and never exercised:
 * "Start fresh today" and the guard rails around it.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173";
const errors: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) errors.push(name);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: `${process.env.HOME}/.pw/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"]', "fresh@example.com");
  await page.fill('input[autocomplete="name"]', "Fresh");
  await page.fill('input[type="password"]', "ledger123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2200);

  const seeded = await page.locator("body").innerText();
  check("seeded portfolios are labelled as examples", /examples, not your decisions/i.test(seeded));
  check("the seed spans a real window", /Nov 13, 2023/.test(seeded), "start date present");

  // The example banner must be dismissible into a real record.
  await page.click('button:has-text("Start fresh today")');
  await page.waitForTimeout(1200);

  const after = await page.locator("body").innerText();
  check("start fresh clears the example banner", !/examples, not your decisions/i.test(after));
  check("start fresh dates the new set today", /Nov 12, 2026/.test(after), "today's date");

  // A fresh set must be flat: same start, same money, so no fake divergence.
  const rows = await page.locator("table tbody tr").count();
  check("three fresh portfolios exist", rows === 3, `${rows} rows`);

  // Persist through reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const reloaded = await page.locator("body").innerText();
  check("the fresh set survives a reload", !/examples, not your decisions/i.test(reloaded));

  // The disclosure about storage must still be honest after the change.
  check(
    "storage limitation is still disclosed",
    /stored in this browser alone/i.test(reloaded),
  );

  await page.screenshot({ path: "/tmp/shots3/after-start-fresh.png", fullPage: true });

  await browser.close();
  console.log(errors.length ? `\nFAILURES: ${errors.join(", ")}` : "\nall fresh-start checks passed");
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("harness crashed:", e);
  process.exitCode = 1;
});
