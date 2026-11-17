// A what-if that starts before one of its stocks existed: that stock's share
// waits in cash until its first trading day instead of blocking the date.
// Needs a confirmed paid throwaway account with no comparison:
//   CREDS="email password" npx tsx checks/listing.check.ts   (with `npx vite preview --port 4173` running)
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
const settle = () => page.getByText("checking…").first().waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});

await page.goto(`${BASE}signin`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.getByText(/How much would you invest/).waitFor({ timeout: 60_000 });
await page.click('button:has-text("Next")');
await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });

await page.locator('input[type="radio"]').nth(1).check();
await page.fill('input[aria-label="Start date"]', "2015-01-02");
// Portfolio 2: half QQQ, half SNOW (first traded Sep 16, 2020). Portfolio 3: all SNOW.
await page.fill('[data-testid="setup-2-ticker-0"]', "QQQ");
await settle();
await page.click('[data-testid="setup-col-2"] button:has-text("Add another")');
await page.fill('[data-testid="setup-2-ticker-1"]', "SNOW");
await settle();
await page.fill('[data-testid="setup-3-ticker-0"]', "SNOW");
await settle();
await page.waitForTimeout(800);
check(
  "the setup page notes SNOW's later start instead of blocking the date",
  /Started trading Sep 16, 2020\. Its share stays in cash until then\./.test(
    await page.innerText('[data-testid="setup-2-listing-1"]').catch(() => ""),
  ),
);
check("no error under the portfolio", (await page.locator('[data-testid="setup-col-2"] .text-loss').count()) === 0);
const run = page.locator('button:has-text("Run the what-if")');
check("the what-if can be started", await run.isEnabled());
await page.screenshot({ path: "checks/out/listing-setup.png", fullPage: true });
await run.click();
await page.getByText(/What-if: chosen with hindsight/).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1500);

const note2 = await page.innerText('[data-testid="col-2-listing"]').catch(() => "");
check("the card says SNOW's share was held as cash until Sep 16, 2020", /SNOW's share was held as cash until it started trading on Sep 16, 2020\./.test(note2), note2);
check("the all-SNOW portfolio has the same note", (await page.locator('[data-testid="col-3-listing"]').count()) === 1);
const val = async (n: number) => Number((await page.innerText(`[data-testid="col-${n}-value"]`)).replace(/[^0-9]/g, ""));
const [v1, v2, v3] = [await val(1), await val(2), await val(3)];
check("every portfolio has a value", v1 > 0 && v2 > 0 && v3 > 0, `${v1} / ${v2} / ${v3}`);
check("the decision log says SNOW's share waited in cash", (await page.locator('[data-testid="decision-waited"]:has-text("SNOW held as cash until it started trading")').count()) === 2);
check("portfolios without SNOW have no note", (await page.locator('[data-testid="col-1-listing"]').count()) === 0);
await page.screenshot({ path: "checks/out/listing-dashboard.png", fullPage: true });

await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
