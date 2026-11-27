// Buy/sell phase 4: clones and date changes carry trades along.
// Needs a confirmed throwaway Premium account with a what-if comparison from
// 2026-10-01: VTI in portfolio 1, NVDA 100% in portfolio 2, and three trades
// on portfolio 2 (sell 50% NVDA Oct 15, buy $2,000 AAPL Nov 2, sell 25% NVDA Nov 10).
//   P4="email password" npx tsx checks/phase4.check.ts   (with `npx vite preview --port 4173` running)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173/papertrades/";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", name, detail ? `— ${detail}` : "");
};

const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });
const [email, password] = process.env.P4!.split(" ");
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}signin`);
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.locator('[data-testid="col-2-clone"]').waitFor({ timeout: 60_000 });
const tradeRows = async (slot: number) => {
  await page.click(`[data-testid="col-${slot}-open"]`);
  await page.locator('[data-testid="detail-trades"]').waitFor({ timeout: 15_000 });
  const rows = await page.locator('[data-testid="trade-row"]').allInnerTexts();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  return rows.map((r) => r.replace(/\s+/g, " "));
};
const notice = async () => (await page.locator('[role="alert"]').allInnerTexts()).join(" / ");

// 1. Clone portfolio 2 as is: its three trades come along.
await page.click('[data-testid="col-2-clone"]');
const note = await page.locator('[data-testid="clone-note"]').innerText();
check("the clone says its trades come along", /Its 3 trades come along too/.test(note), note);
await page.locator('[data-testid="col-3-empty"] button', { hasText: "Add portfolio" }).click();
await page.locator('[data-testid="col-3-open"]').waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);
check("no notice when every trade fits", !/weren't copied|wasn't copied/.test(await notice()), await notice());
const r3 = await tradeRows(3);
check("portfolio 3 has the same three trades", r3.length === 3 && r3.some((r) => /Sold 50% of NVDA/.test(r)) && r3.some((r) => /AAPL/.test(r)), r3.join(" | "));

// 2. Clone it again but as AAPL 100%: none of the trades fit, and the notice says which and why.
await page.click('[data-testid="col-2-clone"]');
const card = page.locator('[data-testid="col-4-empty"]');
await card.waitFor();
const ticker = card.locator("input").first();
await ticker.fill("AAPL");
await page.keyboard.press("Tab");
await page.waitForTimeout(1500);
await card.locator("button", { hasText: "Add portfolio" }).click();
await page.locator('[data-testid="col-4-open"]').waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);
const n2 = await notice();
check("a changed mix leaves out trades that don't fit, saying which", /Portfolio 4: 3 trades weren't copied\. The Oct 15, 2026 sale of NVDA: .*no NVDA/.test(n2), n2);
check("portfolio 4 has no trades", (await tradeRows(4)).length === 0);
await page.screenshot({ path: "checks/out/p4-clone.png" });

// 3. Change the start date to Oct 20: trades before it are left out (and said so up front).
await page.getByRole("button", { name: "Change start date" }).click();
await page.locator('input[aria-label="Start date"]').fill("2026-10-20");
const setupNote = await page.locator('[data-testid="setup-trades-note"]').innerText();
check("the setup page says what happens to the trades", /Your 6 trades come along to the new comparison, except the 2 before Oct 20, 2026\./.test(setupNote), setupNote);
await page.screenshot({ path: "checks/out/p4-setup.png" });
await page.getByRole("button", { name: /Run the what-if from/ }).click();
await page.locator('[data-testid="col-2-open"]').waitFor({ timeout: 60_000 });
await page.waitForTimeout(2500);
const n3 = await notice();
check("the notice names what was left out", /Portfolio 2: 2 trades weren't copied\. The Oct 15, 2026 sale of NVDA: It's before this portfolio starts; The Nov 2, 2026 purchase of AAPL: .*needs \$2,000\.00/.test(n3), n3);
const r2 = await tradeRows(2);
check("portfolio 2 kept the Nov 10 sale", r2.length === 1 && /Nov 10, 2026/.test(r2[0]) && /Sold 25% of NVDA/.test(r2[0]), r2.join(" | "));
await page.screenshot({ path: "checks/out/p4-after.png" });

// 4. The landing page wording.
await page.goto(`${BASE}lp2`);
check("landing page: new honesty line", (await page.getByText("Trade at live prices, or try any past date as a what-if").count()) === 1);

await b.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
