// "+" and Clone bring the new portfolio into view when it opens below the fold.
// Needs a confirmed paid throwaway account with no comparison:
//   CREDS="email password" npx tsx checks/add-scroll.check.ts   (with `npx vite preview --port 4173` running)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173/papertrades/";
const [EMAIL, PASSWORD] = process.env.CREDS!.split(" ");
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", name, detail ? `— ${detail}` : "");
};

const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const settle = () => page.getByText("checking…").first().waitFor({ state: "detached", timeout: 45_000 }).catch(() => {});
const inView = (sel: string) =>
  page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < innerHeight - 100;
  });

await page.goto(`${BASE}signin`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.getByText(/How much would you invest/).waitFor({ timeout: 60_000 });
await page.click('button:has-text("Next")');
await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });

// Five portfolios: QQQ in 2, cloned into 3, 4 and a new 5th (paid accounts can add one).
await page.fill('[data-testid="setup-2-ticker-0"]', "QQQ");
await settle();
for (let i = 0; i < 3; i++) await page.click('[data-testid="setup-col-2-clone"]');
check("setup clone adds a portfolio when all are filled", (await page.locator('section[data-testid^="setup-col-"]').count()) === 5);
await page.click('button:has-text("Start from today")');
await page.getByText(/Live record/).waitFor({ timeout: 60_000 });

// "+" from the top of the page: portfolio 6 opens in the second row, below the fold.
await page.evaluate(() => scrollTo(0, 0));
const before = await page.locator('[data-testid="add-portfolio"]').evaluate(() => scrollY);
await page.click('[data-testid="add-portfolio"]');
await page.waitForTimeout(1200);
check("+ scrolls down to the new portfolio", (await page.evaluate(() => scrollY)) > before && (await inView('[data-testid="col-6-empty"]')));
check("…outlines it", (await page.locator('[data-testid="col-6-empty"][data-flash]').count()) === 1);
check("…and puts the cursor in its ticker box", await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid === "add-6-ticker-0"));
await page.screenshot({ path: "checks/out/add-scroll.png" });
await page.click('[data-testid="col-6-empty"] button:has-text("Cancel")');

// Clone from the top does the same.
await page.evaluate(() => scrollTo(0, 0));
await page.click('[data-testid="col-2-clone"]');
await page.waitForTimeout(1200);
check("Clone scrolls to the copy too", await inView('[data-testid="col-6-empty"]'));

await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
