// Hover boxes on the charts show each portfolio's gain or loss on the cash put
// in so far (weekly deposits don't count as growth).
// Needs a confirmed paid throwaway account with no comparison:
//   CREDS="email password" npx tsx checks/gain.check.ts   (with `npx vite preview --port 4173` running)
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

await page.goto(`${BASE}signin`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
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
await page.waitForTimeout(1000);

// Hover the last day of the comparison chart.
const svg = page.locator('[data-testid="paths-range"]').locator("xpath=../..").locator("svg").first();
await svg.scrollIntoViewIfNeeded();
const box = (await svg.boundingBox())!;
// Step right until the box shows the last day (the chart has a right margin).
const tipBox = page.locator(".pointer-events-none.absolute.top-2");
let lastDay = "";
for (let dx = 40; dx >= 0; dx -= 2) {
  await page.mouse.move(box.x + box.width - dx, box.y + box.height / 2);
  if (!(await tipBox.count())) break;
  lastDay = (await tipBox.locator(".micro").innerText()) || lastDay;
}
for (let dx = 0; dx <= 40; dx += 2) {
  await page.mouse.move(box.x + box.width - dx, box.y + box.height / 2);
  if (await tipBox.count()) break;
}
await page.waitForTimeout(200);
console.log("hovering", await tipBox.locator(".micro").innerText());
const pcts = await page.locator('[data-testid="gain-pct"]').allInnerTexts();
check("the hover box shows a % for each portfolio", pcts.length === 2, pcts.join(", "));
const card2 = await page.innerText('[data-testid="col-2"]');
const cardPct = card2.match(/\(([+−-]?[\d.]+%)\)/)?.[1]?.replace("−", "-");
check("on the last day it matches the card's gain", !!cardPct && pcts[1] === cardPct, `${pcts[1]} vs card ${cardPct}`);
check("it says what the % means", /cash put in so far/.test(await page.locator(".pointer-events-none.absolute.top-2").innerText()));
await page.screenshot({ path: "checks/out/gain-paths.png" });

// The holdings chart's Worth line.
await page.mouse.move(0, 0);
await page.click('[data-testid="col-2-open"]');
await page.waitForTimeout(900);
const chart = page.locator('[data-testid="col-2"] [data-testid="detail-chart"]');
await chart.scrollIntoViewIfNeeded();
const cb = (await chart.boundingBox())!;
await page.mouse.move(cb.x + cb.width * 0.5, cb.y + cb.height / 2);
await page.waitForTimeout(200);
const tip = await page.locator('[data-testid="col-2"] [role="status"]').innerText();
check("the holdings chart's Worth line shows a %", /Worth\s*\$[\d,]+\s*[+−-]?[\d.]+%/.test(tip), tip.replace(/\n/g, " | "));
await page.screenshot({ path: "checks/out/gain-detail.png" });

await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
