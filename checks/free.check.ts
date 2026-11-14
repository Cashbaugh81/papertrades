// The free plan's limits, as a free account sees them. Needs a confirmed
// throwaway account with no comparison and no account_plans row:
//   CREDS="email password" npx tsx checks/free.check.ts   (with `npx vite preview --port 4173` running)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173/papertrades/";
const [EMAIL, PASSWORD] = process.env.CREDS!.split(" ");
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", name, detail ? `— ${detail}` : "");
};

const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });
const page = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const dialog = () => page.locator('[data-testid="upgrade-dialog"]');
const closeDialog = async () => {
  await page.click('[data-testid="upgrade-dialog"] button:has-text("Got it")');
  await dialog().waitFor({ state: "detached", timeout: 5_000 });
};
const settle = () => page.getByText("checking…").first().waitFor({ state: "detached", timeout: 45_000 }).catch(() => {});

await page.goto(`${BASE}signin`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.getByText(/How much would you invest/).waitFor({ timeout: 60_000 });
await page.click('button:has-text("Next")').catch(() => page.click('button[type="submit"]'));
await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });

// ---- setup ---------------------------------------------------------------------
check("portfolio 1 is locked to VTI", await page.locator('[data-testid="setup-1-locked"]').isVisible() && (await page.locator('[data-testid="setup-1-ticker-0"]').count()) === 0);
check("no promise of 10 portfolios", !(await page.getByText(/up to 10 in all/).isVisible()));
check("only 3 portfolios on offer", (await page.locator('[data-testid^="setup-col-"]').count()) === 3);

await page.fill('[data-testid="setup-2-ticker-0"]', "NVDA");
for (const [i, t] of [[1, "SMH"], [2, "AMD"]] as const) {
  await page.click('[data-testid="setup-col-2"] button:has-text("Add another")');
  await page.fill(`[data-testid="setup-2-ticker-${i}"]`, t);
}
await settle();
check("three tickers are allowed", (await page.locator('[data-testid^="setup-2-ticker-"]').count()) === 3);
await page.click('[data-testid="setup-col-2"] button:has-text("Add another")');
check("a fourth ticker asks for a paid account", await dialog().isVisible() && /up to 3 stocks or funds/.test(await dialog().innerText()));
check("…and doesn't add the row", (await page.locator('[data-testid^="setup-2-ticker-"]').count()) === 3);
await closeDialog();
await page.click('button:has-text("Start from today")');

// ---- dashboard -------------------------------------------------------------------
await page.getByText(/Live record/).waitFor({ timeout: 60_000 });
check("portfolio 1 has no Change mix", (await page.locator('[data-testid="col-1"] button:has-text("Change mix")').count()) === 0);
check("…and says why", await page.locator('[data-testid="col-1-locked"]').isVisible());
check("the counter shows the free limit", /2\s*of\s*3/i.test(await page.innerText("#portfolios-title")));

await page.click('[data-testid="add-portfolio"]');
await page.fill('[data-testid="add-3-ticker-0"]', "QQQ");
await settle();
await page.click('[data-testid="col-3-empty"] button:has-text("Add portfolio")');
await page.locator('[data-testid="col-3"]').waitFor({ timeout: 20_000 });
check("a third portfolio is allowed", /3\s*of\s*3/i.test(await page.innerText("#portfolios-title")));

await page.click('[data-testid="add-portfolio"]');
check("+ for a fourth asks for a paid account", await dialog().isVisible() && /up to 3 portfolios/.test(await dialog().innerText()));
check("…and focus is on its button", await page.evaluate(() => document.activeElement?.textContent === "Got it"));
await page.keyboard.press("Escape");
await dialog().waitFor({ state: "detached", timeout: 5_000 });
check("Escape closes it, and no portfolio 4 appears", (await page.locator('[data-testid="col-4-empty"], [data-testid="col-4"]').count()) === 0);

await page.click('[data-testid="col-2"] button:has-text("Change mix")');
await page.click('[data-testid="col-2"] button:has-text("Add another")');
check("changing a mix: a fourth ticker asks for a paid account", await dialog().isVisible());
await closeDialog();

await page.screenshot({ path: "checks/out/free-dashboard.png", fullPage: true });
await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
