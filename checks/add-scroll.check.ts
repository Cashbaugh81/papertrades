// "+" and Clone bring the new portfolio into view when it opens below the fold;
// naming portfolios on the setup page and the dashboard.
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
// Name portfolio 2 on the setup page.
check("setup cards default to Portfolio N", (await page.innerText('[data-testid="setup-col-3-name"]')) === "Portfolio 3");
await page.click('[data-testid="setup-col-2-name-rename"]');
await page.fill('[data-testid="setup-col-2-name-input"]', "Big tech");
await page.keyboard.press("Enter");
check("setup rename shows the new name", (await page.innerText('[data-testid="setup-col-2-name"]')) === "Big tech");
await page.screenshot({ path: "checks/out/names-setup.png" });
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

await page.click('[data-testid="col-6-empty"] button:has-text("Cancel")');
await page.evaluate(() => scrollTo(0, 0));

// ---- names on the dashboard ----
const nameOf = (slot: number) => page.innerText(`[data-testid="col-${slot}-name"]`);
check("the setup name carried over", (await nameOf(2)) === "Big tech");
check("unnamed portfolios show Portfolio N", (await nameOf(1)) === "Portfolio 1" && (await nameOf(3)) === "Portfolio 3");
check("the chart legend uses the name", (await page.getByText("Big tech").count()) >= 2);
await page.click('[data-testid="col-3-name-rename"]');
await page.fill('[data-testid="col-3-name-input"]', "My picks");
await page.keyboard.press("Enter");
check("renaming on the dashboard saves", await page.locator('[data-testid="col-3-name"]:has-text("My picks")').waitFor({ timeout: 10_000 }).then(() => true, () => false));
await page.click('[data-testid="col-4-name-rename"]');
await page.fill('[data-testid="col-4-name-input"]', "Throwaway");
await page.keyboard.press("Escape");
check("Escape cancels a rename", (await nameOf(4)) === "Portfolio 4");
await page.screenshot({ path: "checks/out/names-dashboard.png" });
await page.reload();
await page.getByText(/Live record/).waitFor({ timeout: 60_000 });
check("names survive a reload", (await nameOf(2)) === "Big tech" && (await nameOf(3)) === "My picks");
check("…and show in the decision log", (await page.locator("section:has(h2:has-text('Decisions'))").innerText()).includes("My picks"));

// Changing the mix keeps the name.
await page.click('[data-testid="col-3"] button:has-text("Change mix")');
await page.fill('[data-testid="edit-3-ticker-0"]', "SPY");
await settle();
await page.click('[data-testid="col-3"] button:has-text("Replace mix")');
await page.locator('[data-testid="col-3-mix"]:has-text("SPY")').waitFor({ timeout: 20_000 });
check("changing the mix keeps the name", (await nameOf(3)) === "My picks");

// Clearing the name goes back to the default.
await page.click('[data-testid="col-3-name-rename"]');
await page.fill('[data-testid="col-3-name-input"]', "");
await page.keyboard.press("Enter");
check("an empty name goes back to Portfolio N", await page.locator('[data-testid="col-3-name"]:has-text("Portfolio 3")').waitFor({ timeout: 10_000 }).then(() => true, () => false));

// Change start date keeps the names.
await page.click('button:has-text("Change start date")');
await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });
check("Change start date keeps the names", (await page.innerText('[data-testid="setup-col-2-name"]')) === "Big tech");

await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
