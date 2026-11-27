// "Now" trades (buy/sell phase 3), run while the market is open: the dialog
// shows the live price, a sale and a purchase placed now wait to fill, they
// can be cancelled, and the server takes its own live price.
// Needs a confirmed throwaway Premium account whose comparison has NVDA 100%
// in portfolio 2 and no trades:
//   NOW="email password" npx tsx checks/now.check.ts   (with `npx vite preview --port 4173` running)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173/papertrades/";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", name, detail ? `— ${detail}` : "");
};

const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });
const [email, password] = process.env.NOW!.split(" ");
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}signin`);
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.locator('[data-testid="col-2-open"]').waitFor({ timeout: 60_000 });
await page.click('[data-testid="col-2-open"]');
await page.locator('[data-testid="trade-NVDA"]').waitFor({ timeout: 20_000 });
const dlg = page.locator('[data-testid="trade-dialog"]');
const preview = async () => {
  await page.waitForTimeout(400);
  return (await page.locator('[data-testid="trade-preview"]').innerText()).replace(/\n/g, " | ");
};

// Sell half of NVDA now.
await page.click('[data-testid="trade-NVDA"]');
await dlg.waitFor();
check("Now is the default", (await dlg.locator('[data-when="now"]').getAttribute("aria-checked")) === "true");
check("no date field for now", (await dlg.locator('[data-testid="trade-date"]').count()) === 0);
await page.waitForFunction(() => !/Getting/.test(document.querySelector('[data-testid="trade-now-note"]')?.textContent ?? ""), null, { timeout: 15_000 });
const note = await dlg.locator('[data-testid="trade-now-note"]').innerText();
check("the live price shows, with its time", /Live price \$[\d,.]+ at \d{1,2}:\d\d [AP]M ET/.test(note), note);
const p1 = await preview();
check("the preview estimates the sale at the live price, with gain and tax", /About [\d.]+ shares at \$[\d,.]+ \(live\)[\s\S]*Brings in[\s\S]*(Gain|Loss) on it[\s\S]*Estimated tax[\s\S]*Cash after/.test(p1), p1);
await page.screenshot({ path: "checks/out/now-sell.png" });
await dlg.locator('[data-testid="trade-confirm"]').click();
await dlg.waitFor({ state: "detached", timeout: 30_000 });
await page.locator('[data-testid="pending-row"]').first().waitFor({ timeout: 15_000 });
const rows = await page.locator('[data-testid="pending-row"]').allInnerTexts();
check("the sale waits to fill, at the live price taken by the server", rows.length === 1 && /Sell 50% of NVDA at the live price, \$[\d,.]+ \(\d{1,2}:\d\d [AP]M ET\)/.test(rows[0]), rows.join(" / "));

// Buy with the money the sale will bring in.
await page.locator('[data-testid="detail-trades"] button', { hasText: "Buy with cash" }).click();
await dlg.waitFor();
await page.fill('[data-testid="trade-ticker"]', "AAPL");
await page.keyboard.press("Tab");
await page.waitForTimeout(2500);
const avail = await dlg.locator('[data-testid="trade-available"]').innerText();
check("cash you can spend counts the pending sale", /Cash you can spend now: \$[1-9][\d,.]+ \(counting your orders waiting to fill\)/.test(avail), avail);
await page.fill('[data-testid="trade-amount"]', "999999");
check("too much is refused before sending", /free to spend/.test(await preview()));
check("…and can't be confirmed", await dlg.locator('[data-testid="trade-confirm"]').isDisabled());
await page.fill('[data-testid="trade-amount"]', "1000");
const p2 = await preview();
check("a $1,000 purchase previews", /About [\d.]+ shares at \$[\d,.]+ \((live|last close)/.test(p2), p2);
await dlg.locator('[data-testid="trade-confirm"]').click();
await dlg.waitFor({ state: "detached", timeout: 30_000 });
await page.waitForTimeout(1500);
const rows2 = await page.locator('[data-testid="pending-row"]').allInnerTexts();
check("both orders wait", rows2.length === 2 && rows2.some((r) => /Buy \$1,000\.00 of AAPL/.test(r)), rows2.join(" / "));
await page.locator('[data-testid="detail-trades"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: "checks/out/now-pending.png" });

// Cancel the purchase.
await page.locator('[data-testid="pending-row"]', { hasText: "AAPL" }).locator('[data-testid="pending-cancel"]').click();
await page.locator('[data-testid="pending-cancel-confirm"]').click();
await page.waitForTimeout(2000);
const rows3 = await page.locator('[data-testid="pending-row"]').allInnerTexts();
check("cancelling removes it", rows3.length === 1 && /NVDA/.test(rows3[0]), rows3.join(" / "));

// A past-date trade still works from the same dialog.
await page.click('[data-testid="trade-NVDA"]');
await dlg.waitFor();
await dlg.locator('[data-when="date"]').click();
check("On a past date shows the date field", (await dlg.locator('[data-testid="trade-date"]').count()) === 1);
await page.keyboard.press("Escape");

await b.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
