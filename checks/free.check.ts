// The free plan's limits, cloning, and upgrading via Join Waitlist, as a free account sees them. Needs a confirmed
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
  await page.click('[data-testid="upgrade-dialog"] button[aria-label="Close"]');
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
check("only 3 portfolios on offer", (await page.locator('section[data-testid^="setup-col-"]').count()) === 3);

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

// Clone portfolio 2 into the empty portfolio 3, then adjust it.
await page.click('[data-testid="setup-col-2-clone"]');
check("setup clone fills the empty portfolio 3", await (async () => {
  const v = await Promise.all([0, 1, 2].map((k) => page.inputValue(`[data-testid="setup-3-ticker-${k}"]`).catch(() => "")));
  return v.join(",") === "NVDA,SMH,AMD" && /copy of portfolio 2/i.test(await page.innerText('[data-testid="setup-col-3"]'));
})());
await page.fill('[data-testid="setup-3-ticker-0"]', "QQQ");
await settle();
check("…and stays editable", (await page.inputValue('[data-testid="setup-3-ticker-0"]')) === "QQQ" && (await page.inputValue('[data-testid="setup-2-ticker-0"]')) === "NVDA");
check("setup: portfolio 1 is called Baseline Market ETF", (await page.innerText('[data-testid="setup-col-1-name"]')) === "Baseline Market ETF");
await page.click('[data-testid="setup-col-1-clone"]');
check("cloning with no room left asks for a paid account", await dialog().isVisible() && /up to 3 portfolios/.test(await dialog().innerText()));
await closeDialog();
await page.screenshot({ path: "checks/out/setup-clone.png", fullPage: true });
await page.click('button:has-text("Start from today")');

// ---- dashboard -------------------------------------------------------------------
await page.getByText(/Live record/).waitFor({ timeout: 60_000 });
check("portfolio 1 has no Change mix", (await page.locator('[data-testid="col-1"] button:has-text("Change mix")').count()) === 0);
check("…and says why", await page.locator('[data-testid="col-1-locked"]').isVisible());
check("a free account's portfolio 1 is called Baseline Market ETF", (await page.innerText('[data-testid="col-1-name"]')) === "Baseline Market ETF");
check("…but can be cloned", await page.locator('[data-testid="col-1-clone"]').isVisible());
check("the counter shows the free limit", /3\s*of\s*3/i.test(await page.innerText("#portfolios-title")));

await page.click('[data-testid="col-2"] button:has-text("Change mix")');
await page.click('[data-testid="col-2"] button:has-text("Add another")');
check("changing a mix: a fourth ticker asks for a paid account", await dialog().isVisible() && /up to 3 stocks/.test(await dialog().innerText()));
await closeDialog();
await page.click('[data-testid="col-2"] button:has-text("Cancel")');

await page.click('[data-testid="add-portfolio"]');
check("+ for a fourth asks for a paid account", await dialog().isVisible() && /up to 3 portfolios/.test(await dialog().innerText()));
await closeDialog();
await page.click('[data-testid="col-2-clone"]');
check("Clone for a fourth asks too", await dialog().isVisible() && /up to 3 portfolios/.test(await dialog().innerText()));
check("…and focus is on Join Waitlist", await page.evaluate(() => document.activeElement?.textContent === "Join Waitlist"));
check("it shows the price and the three benefits", await (async () => {
  const t = await dialog().innerText();
  return /\$2\.99\s*\/\s*month/.test(t) && /Up to 10 portfolios/.test(t) && /Unlimited stock tickers/.test(t) && /Buy and sell order tracking/.test(t);
})());
check("the image loads", await page.locator('[data-testid="upgrade-dialog"] img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0));
await page.screenshot({ path: "checks/out/upgrade-1280.png" });
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(300);
const fits = await dialog().evaluate((d) => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
check("on a phone the window fits the screen", fits);
await page.screenshot({ path: "checks/out/upgrade-375.png" });
await page.setViewportSize({ width: 1280, height: 1000 });

await page.click('[data-testid="upgrade-dialog"] button:has-text("Join Waitlist")');
check("joining says congrats on your subscription", await page.locator('[data-testid="waitlist-joined"]:has-text("Congrats on your subscription")').waitFor({ timeout: 10_000 }).then(() => true, () => false));
check("…with focus on Continue", await page.evaluate(() => document.activeElement?.textContent === "Continue"));
await page.screenshot({ path: "checks/out/upgrade-joined.png" });
await page.click('[data-testid="upgrade-dialog"] button:has-text("Continue")');
await dialog().waitFor({ state: "detached", timeout: 5_000 });
check("the limits lift straight away", await page.getByText(/3\s*of\s*10/i).first().waitFor({ timeout: 10_000 }).then(() => true, () => false));
check("…portfolio 1 can be changed now", await page.locator('[data-testid="col-1"] button:has-text("Change mix")').isVisible());

await page.click('[data-testid="col-2-clone"]');
check("dashboard clone opens portfolio 4 with the same mix", await (async () => {
  await page.locator('[data-testid="col-4-empty"]').waitFor({ timeout: 5_000 });
  const v = await Promise.all([0, 1, 2].map((k) => page.inputValue(`[data-testid="add-4-ticker-${k}"]`).catch(() => "")));
  return [...v].sort().join(",") === "AMD,NVDA,SMH" && /copy of portfolio 2/i.test(await page.innerText('[data-testid="col-4-empty"]'));
})());
await page.screenshot({ path: "checks/out/dashboard-clone.png" });
await page.fill('[data-testid="add-4-ticker-0"]', "MSFT");
await settle();
await page.click('[data-testid="col-4-empty"] button:has-text("Add portfolio")');
check("…and adds the adjusted copy", await page.locator('[data-testid="col-4-mix"]').waitFor({ timeout: 20_000 }).then(async () => /MSFT/.test(await page.innerText('[data-testid="col-4-mix"]')), () => false));
check("the original is untouched", /NVDA/.test(await page.innerText('[data-testid="col-2-mix"]')) && !/MSFT/.test(await page.innerText('[data-testid="col-2-mix"]')));
check("the account is now paid on the server", await page.getByText(/4\s*of\s*10/i).first().isVisible());

await page.screenshot({ path: "checks/out/free-dashboard.png", fullPage: true });
await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
