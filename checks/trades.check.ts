// Buying and selling (trades, phase 2): Trade on a holding, Buy from the cash,
// refusals that name the trade they'd break, delete, weekend dates, changing
// the starting mix with trades, Premium only, never portfolio 1.
// Needs two confirmed throwaway accounts with no comparison, one paid and one free:
//   PREMIUM="email password" FREE="email password" npx tsx checks/trades.check.ts
//   (with `npx vite preview --port 4173` running)
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173/papertrades/";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", name, detail ? `— ${detail}` : "");
};

const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });

async function start(creds: string): Promise<Page> {
  const [email, password] = creds.split(" ");
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const settle = () => page.getByText("checking…").first().waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});
  await page.goto(`${BASE}signin`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.getByText(/How much would you invest/).waitFor({ timeout: 60_000 });
  await page.click('button:has-text("Next")'); // $10,000 and $100 a week
  await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });
  await page.locator('input[type="radio"]').nth(1).check();
  await page.fill('input[aria-label="Start date"]', "2026-05-29");
  await page.fill('[data-testid="setup-2-ticker-0"]', "NVDA");
  await settle();
  await page.click('button:has-text("Run the what-if")');
  await page.getByText(/What-if: chosen with hindsight/).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(800);
  return page;
}

const dlg = (page: Page) => page.locator('[data-testid="trade-dialog"]');
async function openTrade(page: Page, testId: string) {
  await page.click(`[data-testid="${testId}"]`);
  await dlg(page).waitFor({ timeout: 5_000 });
  await dlg(page).locator('[data-when="date"]').click(); // these are all trades on a past date (now trades: now.check.ts)
}
async function waitPreview(page: Page) {
  await page.waitForTimeout(300);
  return page.locator('[data-testid="trade-preview"]').innerText();
}

// ---------------------------------------------------------------- Premium
{
  const page = await start(process.env.PREMIUM!);
  await page.click('[data-testid="col-1-open"]');
  await page.waitForTimeout(800);
  check("portfolio 1 has no Trade buttons", (await page.locator('[data-testid="col-1"] [data-testid^="trade-"]').count()) === 0);
  await page.click('[data-testid="col-1-close"]');
  await page.waitForTimeout(600);

  await page.click('[data-testid="col-2-open"]');
  await page.waitForTimeout(900);
  check("a holding has Trade", (await page.locator('[data-testid="trade-NVDA"]').count()) === 1);

  // Sell half of NVDA on Aug 3.
  await openTrade(page, "trade-NVDA");
  await page.fill('[data-testid="trade-date"]', "2026-08-03");
  const sellPreview = await waitPreview(page);
  check("the preview shows shares, price, money and gain", /Sells[\s\S]*shares at \$[\d,.]+ on Aug 3, 2026[\s\S]*Brings in[\s\S]*(Gain|Loss) on it[\s\S]*Estimated tax/.test(sellPreview), sellPreview.replace(/\n/g, " | "));
  await page.screenshot({ path: "checks/out/trades-sell.png" });
  await page.click('[data-testid="trade-confirm"]');
  await dlg(page).waitFor({ state: "detached", timeout: 30_000 });
  await page.waitForTimeout(1200);
  const rows1 = await page.locator('[data-testid="trade-row"]').allInnerTexts();
  check("the sale is listed", rows1.length === 1 && /Sold 50% of NVDA \([\d.]+ shares at \$[\d,.]+\) for \$[\d,.]+: (gain|loss) \$[\d,.]+, short-term/.test(rows1[0]), rows1.join(" / "));
  check("there's a cash row with Buy", (await page.locator('[data-testid="trade-cash"]').count()) === 1);
  const tax = await page.locator('[data-testid="tax-actual"]').innerText();
  check("Tax owed so far shows 2026", /2026/.test(tax), tax.replace(/\n/g, " | "));

  // Buy VTI with the cash on Sep 1: first too much, then $2,000.
  await openTrade(page, "trade-cash");
  await page.fill('[data-testid="trade-ticker"]', "VTI");
  await page.waitForTimeout(2500);
  await page.fill('[data-testid="trade-date"]', "2026-09-01");
  await page.fill('[data-testid="trade-amount"]', "50000");
  const tooMuch = await waitPreview(page);
  check("too big a purchase says how much cash there is", /needs \$50,000\.00, but only \$[\d,.]+ is in cash then/.test(tooMuch), tooMuch);
  check("…and can't be confirmed", await page.locator('[data-testid="trade-confirm"]').isDisabled());
  await page.fill('[data-testid="trade-amount"]', "2000");
  await waitPreview(page);
  await page.click('[data-testid="trade-confirm"]');
  await dlg(page).waitFor({ state: "detached", timeout: 30_000 });
  await page.waitForTimeout(1200);
  check("the purchase is listed", (await page.locator('[data-testid="trade-row"]').allInnerTexts()).some((t) => /Bought [\d.]+ shares of VTI at \$[\d,.]+ for \$2,000\.00/.test(t)));
  check("VTI is now a holding with Trade", (await page.locator('[data-testid="trade-VTI"]').count()) === 1);

  // An earlier purchase that would starve the Sep 1 one.
  await openTrade(page, "trade-cash");
  await page.fill('[data-testid="trade-ticker"]', "VTI");
  await page.waitForTimeout(2500);
  await page.fill('[data-testid="trade-date"]', "2026-08-10");
  const cashNote = await page.locator('[data-testid="trade-available"]').innerText();
  const avail = Number(cashNote.match(/\$([\d,.]+)/)?.[1].replace(/,/g, ""));
  check("cash you can spend leaves what the later purchase needs", /the rest is used by later purchases/.test(cashNote), cashNote);
  await page.fill('[data-testid="trade-amount"]', String(Math.ceil(avail + 500)));
  const starve = await waitPreview(page);
  check("it names the later trade it would break", /would stop another trade from working:[\s\S]*Sep 1, 2026 purchase of VTI needs \$2,000\.00/.test(starve), starve.replace(/\n/g, " | "));
  await page.keyboard.press("Escape");
  await dlg(page).waitFor({ state: "detached" });

  // Deleting the sale would break the purchase.
  const saleRow = page.locator('[data-testid="trade-row"]', { hasText: "Sold" });
  await saleRow.locator('[data-testid="trade-delete"]').click();
  await saleRow.locator('[data-testid="trade-delete-confirm"]').click();
  await page.waitForTimeout(400);
  const delProblem = await page.locator('[data-testid="trade-delete-problem"]').innerText().catch(() => "");
  check("deleting the sale the purchase relies on is refused", /Sep 1, 2026 purchase of VTI needs/.test(delProblem), delProblem);

  // Weekend date: the next trading day.
  await openTrade(page, "trade-NVDA");
  await page.fill('[data-testid="trade-date"]', "2026-10-03"); // a Saturday
  await page.waitForTimeout(300);
  const note = await page.locator('[data-testid="trade-day-note"]').innerText();
  check("a weekend date uses the next trading day", /market was closed then, so this uses the next trading day, Oct 5, 2026/.test(note), note);
  await page.keyboard.press("Escape");
  await dlg(page).waitFor({ state: "detached" });

  // Changing the starting mix: one that breaks the NVDA sale is refused; one that keeps NVDA works and keeps the trades.
  await page.fill('[data-testid="edit-2-ticker-0"]', "META");
  await page.waitForTimeout(2500);
  await page.click('[data-testid="col-2-save"]');
  await page.waitForTimeout(500);
  const err = await page.locator('[data-testid="col-2-editor"]').innerText();
  check("a mix that breaks a trade is refused, naming it", /wouldn't work: There's no NVDA to sell on Aug 3, 2026\./.test(err), err.replace(/\n/g, " | ").slice(0, 300));
  await page.fill('[data-testid="edit-2-ticker-0"]', "NVDA");
  await page.waitForTimeout(2500);
  await page.press('[data-testid="edit-2-ticker-0"]', "Tab"); // close the search results
  const add = page.locator('[data-testid="col-2"] button:has-text("Add another")');
  await add.first().click();
  await page.fill('[data-testid="edit-2-ticker-1"]', "META");
  await page.waitForTimeout(2500);
  await page.press('[data-testid="edit-2-ticker-1"]', "Tab");
  check("the editor says trades stay", /Your 2 trades stay and happen on the same dates/.test(await page.locator('[data-testid="col-2-editor"]').innerText()));
  await page.click('[data-testid="col-2-save"]');
  await page.waitForTimeout(3000);
  await page.click('[data-testid="col-2-open"]').catch(() => {});
  await page.waitForTimeout(1200);
  check("after the mix change both trades are still there", (await page.locator('[data-testid="trade-row"]').count()) === 2);
  check("…and nothing is broken", (await page.locator('[data-testid="trades-broken"]').count()) === 0);
  const log = await page.locator("section", { hasText: "Decisions" }).last().innerText();
  check("the decision log lists the trades", /sold\s+50% of NVDA/.test(log) && /bought\s+\$2,000\.00 of VTI/.test(log), log.replace(/\n/g, " | ").slice(0, 400));

  // Delete the purchase, then the sale.
  const buyRow = page.locator('[data-testid="trade-row"]', { hasText: "Bought" });
  await buyRow.locator('[data-testid="trade-delete"]').click();
  await buyRow.locator('[data-testid="trade-delete-confirm"]').click();
  await page.waitForTimeout(2500);
  check("the purchase can be deleted", (await page.locator('[data-testid="trade-row"]').count()) === 1);
  await page.locator('[data-testid="detail-trades"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: "checks/out/trades-list.png" });

  // On a phone the dialog is a sheet that fits the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.locator('[data-testid="trade-NVDA"]').scrollIntoViewIfNeeded();
  await openTrade(page, "trade-NVDA");
  await waitPreview(page);
  const box = (await dlg(page).boundingBox())!;
  check("on a phone the dialog fits the screen", box.x >= 0 && box.width <= 390 && (await page.evaluate(() => document.documentElement.scrollWidth <= 391)));
  check("…and its button is on screen", await page.locator('[data-testid="trade-confirm"]').isVisible());
  await page.screenshot({ path: "checks/out/trades-phone.png" });
  await page.close();
}

// ---------------------------------------------------------------- Free
{
  const page = await start(process.env.FREE!);
  await page.click('[data-testid="col-2-open"]');
  await page.waitForTimeout(900);
  await page.click('[data-testid="trade-NVDA"]');
  await page.waitForTimeout(500);
  check("a free account gets the upgrade window", (await page.locator('[data-testid="upgrade-dialog"]').count()) === 1);
  check("…which says why", /Selling and buying on any date is part of Premium/.test(await page.locator('[data-testid="upgrade-dialog"]').innerText()));
  check("no trade dialog", (await dlg(page).count()) === 0);
  await page.close();
}

await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
