// Buying by shares: a Shares column next to %, either one can be typed, and
// money not spent on shares stays in cash.
// Needs a confirmed paid throwaway account with no comparison:
//   CREDS="email password" npx tsx checks/shares.check.ts   (with `npx vite preview --port 4173` running)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173/papertrades/";
const [EMAIL, PASSWORD] = process.env.CREDS!.split(" ");
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", name, detail ? `— ${detail}` : "");
};

const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const settle = () => page.getByText("checking…").first().waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});
const val = (sel: string) => page.inputValue(sel);

await page.goto(`${BASE}signin`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.getByText(/How much would you invest/).waitFor({ timeout: 60_000 });
await page.fill("#weekly", "0"); // so the holdings are exactly what the shares bought
await page.click('button:has-text("Next")');
await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });
await page.locator('input[type="radio"]').nth(1).check();
await page.fill('input[aria-label="Start date"]', "2026-05-29"); // a trading day (Friday)

check("the editor has a Shares column", (await page.locator('[data-testid="setup-2-shares-0"]').count()) === 1);
await page.fill('[data-testid="setup-2-ticker-0"]', "NVDA");
await settle();
await page.waitForFunction(() => !(document.querySelector('[data-testid="setup-2-shares-0"]') as HTMLInputElement)?.disabled, null, { timeout: 20_000 });
// 100% of $10,000 at NVDA's Jun 1, 2026 close.
const derived = Number(await val('[data-testid="setup-2-shares-0"]'));
check("a percentage shows the shares it buys", derived > 30 && derived < 60, String(derived));
check("the price it buys at is shown", /a share on May 29, 2026/.test(await page.innerText('section[data-testid="setup-col-2"]')));

// Type shares instead.
await page.fill('[data-testid="setup-2-shares-0"]', "20");
const pct = Number(await val('[data-testid="setup-2-pct-0"]'));
check("typing shares sets the percentage", Math.abs(pct - (20 / derived) * 100) < 0.05, `${pct}%`);
check("the rest is shown as cash", /Cash \$/.test(await page.innerText('[data-testid="setup-2-total"]')), await page.innerText('[data-testid="setup-2-total"]'));
check("and explained", (await page.locator('[data-testid="setup-2-cash-note"]').count()) === 1);

// Too many shares.
await page.fill('[data-testid="setup-2-shares-0"]', "1000");
check("more shares than the money is refused", /more than the \$10,000 you start with/.test(await page.innerText('section[data-testid="setup-col-2"]')));
await page.fill('[data-testid="setup-2-shares-0"]', "20");

// A second stock by shares; it doesn't reset the first.
await page.click('[data-testid="setup-col-2"] button:has-text("Add another")');
check("adding a row keeps the first row's shares", (await val('[data-testid="setup-2-shares-0"]')) === "20");
await page.fill('[data-testid="setup-2-ticker-1"]', "MSFT");
await settle();
await page.waitForFunction(() => !(document.querySelector('[data-testid="setup-2-shares-1"]') as HTMLInputElement)?.disabled, null, { timeout: 20_000 });
await page.fill('[data-testid="setup-2-shares-1"]', "2.75"); // a fraction of a share
const total = await page.innerText('[data-testid="setup-2-total"]');
await page.screenshot({ path: "checks/out/shares-setup.png" });

// A percentage-only portfolio still has to add up to 100.
await page.fill('[data-testid="setup-3-ticker-0"]', "VOO");
await settle();
await page.fill('[data-testid="setup-3-pct-0"]', "90");
check("percentages alone must still make 100%", /90%, not 100%/.test(await page.innerText('section[data-testid="setup-col-3"]')));
await page.fill('[data-testid="setup-3-pct-0"]', "100");

await page.click('button:has-text("Run the what-if")');
await page.getByText(/What-if: chosen with hindsight/).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1000);
const card = await page.innerText('[data-testid="col-2"]');
check("the portfolio's mix names its cash", /Cash [\d.]+%/.test(card), total);

await page.click('[data-testid="col-2-open"]');
await page.waitForTimeout(900);
const holdings = await page.innerText('[data-testid="col-2"] [data-testid="detail-holdings"]');
const nvda = holdings.split("\n").find((l) => l.startsWith("NVDA")) ?? "";
check("it holds exactly the 20 shares", /\s20(\.000)?\s/.test(` ${nvda.replace(/\t/g, " ")} `), nvda.replace(/\t/g, " "));
const msft = holdings.split("\n").find((l) => l.startsWith("MSFT")) ?? "";
check("a fraction of a share is held and shown", /\s2\.75\s/.test(` ${msft.replace(/\t/g, " ")} `), msft.replace(/\t/g, " "));
check("and lists the cash", (await page.locator('[data-testid="col-2"] [data-testid="detail-cash-row"]').count()) === 1);
check("the editor reopens with the same shares", (await val('[data-testid="edit-2-shares-0"]')).startsWith("20") || (await val('[data-testid="edit-2-shares-1"]')).startsWith("20"));
check("…and nothing to save", await page.locator('[data-testid="col-2-save"]').isDisabled());
await page.screenshot({ path: "checks/out/shares-open.png", fullPage: true });

await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
