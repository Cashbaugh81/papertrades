// "Now" trades (buy/sell phase 3), run while the market is open: the dialog
// shows the live price; a sale and a purchase placed now happen on the spot at
// the server's own live price, and show straight away.
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
const sharesBefore = Number((await page.locator("tr", { hasText: "NVDA" }).first().innerText()).match(/\t([\d.]+)\t/)?.[1]);
await dlg.locator('[data-testid="trade-confirm"]').click();
await dlg.waitFor({ state: "detached", timeout: 30_000 });
await page.locator('[data-testid="trade-row"]').first().waitFor({ timeout: 15_000 });
const rows = await page.locator('[data-testid="trade-row"]').allInnerTexts();
check("the sale is done at once, at the live price", rows.length === 1 && /Sold 50% of NVDA \([\d.]+ shares at \$[\d,.]+\) for \$[\d,.]+: (gain|loss) \$[\d,.]+, short-term\. The money went to cash\. Live price at \d{1,2}:\d\d [AP]M ET\./.test(rows[0]), rows.join(" / "));
check("nothing is left waiting", (await page.locator('[data-testid="pending-row"]').count()) === 0);
const sharesAfter = Number((await page.locator("tr", { hasText: "NVDA" }).first().innerText()).match(/\t([\d.]+)\t/)?.[1]);
check("the holding halved", Math.abs(sharesAfter - sharesBefore / 2) < 0.0002, `${sharesBefore} → ${sharesAfter}`);
check("there's a cash row", (await page.locator('[data-testid="detail-cash-row"]').count()) === 1);

// Buy with the money from the sale.
await page.click('[data-testid="trade-cash"]');
await dlg.waitFor();
await page.fill('[data-testid="trade-ticker"]', "AAPL");
await page.keyboard.press("Tab");
await page.waitForTimeout(2500);
const avail = await dlg.locator('[data-testid="trade-available"]').innerText();
check("cash you can spend is the sale's money", /Cash you can spend now: \$[1-9][\d,.]+\./.test(avail), avail);
await page.fill('[data-testid="trade-amount"]', "999999");
check("too much is refused before sending", /free to spend/.test(await preview()));
check("…and can't be confirmed", await dlg.locator('[data-testid="trade-confirm"]').isDisabled());
await page.fill('[data-testid="trade-amount"]', "1000");
const p2 = await preview();
check("a $1,000 purchase previews", /About [\d.]+ shares at \$[\d,.]+ \((live|last close)/.test(p2), p2);
await dlg.locator('[data-testid="trade-confirm"]').click();
await dlg.waitFor({ state: "detached", timeout: 30_000 });
await page.waitForTimeout(1500);
const rows2 = await page.locator('[data-testid="trade-row"]').allInnerTexts();
check("the purchase is done too", rows2.length === 2 && rows2.some((r) => /Bought [\d.]+ shares of AAPL at \$[\d,.]+ for \$1,000\.00\. Live price at/.test(r)), rows2.join(" / "));
check("AAPL is a holding with Trade", (await page.locator('[data-testid="trade-AAPL"]').count()) === 1);
await page.locator('[data-testid="detail-trades"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: "checks/out/now-done.png" });

// Deleting the sale would break the purchase; deleting the purchase works.
await page.locator('[data-testid="trade-row"]', { hasText: "Sold" }).locator('[data-testid="trade-delete"]').click();
await page.locator('[data-testid="trade-delete-confirm"]').click();
await page.waitForTimeout(1500);
check("deleting the sale the purchase needs is refused", /AAPL/.test(await page.locator('[data-testid="trade-delete-problem"]').innerText().catch(() => "")));
await page.locator('[data-testid="trade-row"]', { hasText: "Bought" }).locator('[data-testid="trade-delete"]').click();
await page.locator('[data-testid="trade-delete-confirm"]').click();
await page.waitForTimeout(2000);
check("deleting the purchase works", (await page.locator('[data-testid="trade-row"]').count()) === 1);

// A past-date trade still works from the same dialog.
await page.click('[data-testid="trade-NVDA"]');
await dlg.waitFor();
await dlg.locator('[data-when="date"]').click();
check("On a past date shows the date field", (await dlg.locator('[data-testid="trade-date"]').count()) === 1);
await page.keyboard.press("Escape");

await b.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
