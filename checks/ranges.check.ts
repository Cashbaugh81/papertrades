// Time ranges on the charts: 1W … 10Y, YTD, All; ranges longer than the
// history are greyed out (except the first that reaches past the start).
// Needs a confirmed paid throwaway account with no comparison:
//   CREDS="email password" npx tsx checks/ranges.check.ts   (with `npx vite preview --port 4173` running)
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173/papertrades/";
const [EMAIL, PASSWORD] = process.env.CREDS!.split(" ");
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", name, detail ? `— ${detail}` : "");
};
const enabled = (page: Page, id: string) =>
  page.locator(`[data-testid="${id}"] button`).evaluateAll((els) =>
    els.filter((e) => e.getAttribute("aria-disabled") !== "true").map((e) => e.getAttribute("data-range")),
  );
const ticks = (page: Page) =>
  page.locator('[data-testid="paths-range"]').locator("xpath=../..").locator("svg text").evaluateAll((els) => els.map((e) => e.textContent ?? ""));

const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const settle = () => page.getByText("checking…").first().waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});

await page.goto(`${BASE}signin`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.getByText(/How much would you invest/).waitFor({ timeout: 60_000 });
await page.click('button:has-text("Next")');
await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });
await page.locator('input[type="radio"]').nth(1).check();
await page.fill('input[aria-label="Start date"]', "2026-09-10"); // about 2½ months back
await page.fill('[data-testid="setup-2-ticker-0"]', "QQQ");
await settle();
await page.click('button:has-text("Run the what-if")');
await page.getByText(/What-if: chosen with hindsight/).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1000);

const on = await enabled(page, "paths-range");
check("2½ months: only 1W, 1M, 3M and All can be picked", JSON.stringify(on) === JSON.stringify(["1W", "1M", "3M", "All"]), JSON.stringify(on));
check("All is picked to start", (await page.locator('[data-testid="paths-range"] [aria-checked="true"]').innerText()) === "All");
const before = await ticks(page);
await page.click('[data-testid="paths-range"] [data-range="6M"]', { force: true });
check("a greyed-out range can't be picked", (await page.locator('[data-testid="paths-range"] [aria-checked="true"]').innerText()) === "All");
await page.click('[data-testid="paths-range"] [data-range="1M"]');
const after = await ticks(page);
check("1M is shown as picked", (await page.locator('[data-testid="paths-range"] [aria-checked="true"]').innerText()) === "1M");
check("1M redraws the chart over the last month", JSON.stringify(after) !== JSON.stringify(before) && !after.some((t) => /Sep/.test(t)), `${before.join(",")} → ${after.join(",")}`);
await page.locator('[data-testid="paths-range"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: "checks/out/ranges-paths.png" });

await page.click('[data-testid="col-2-open"]');
await page.waitForTimeout(900);
const det = await enabled(page, "detail-range");
check("the holdings chart has the same ranges", JSON.stringify(det) === JSON.stringify(["1W", "1M", "3M", "All"]), JSON.stringify(det));
const lineCount = await page.locator('[data-testid="col-2"] [data-testid="detail-line"]').count();
await page.click('[data-testid="detail-range"] [data-range="1W"]');
const from = await page.locator('[data-testid="col-2"] [data-testid="detail-line"]').first().getAttribute("data-from");
check("1W on the holdings chart starts a week back", !!from && from >= "2026-11-13", String(from));
check("the start marker is gone from the 1W view", !(await page.locator('[data-testid="col-2"] [data-testid="detail-marker"]').allInnerTexts()).some((t) => /Start/.test(t)));
check("still one line per holding", (await page.locator('[data-testid="col-2"] [data-testid="detail-line"]').count()) === lineCount);
await page.waitForTimeout(300);
await page.locator('[data-testid="col-2"] [data-testid="detail-chart"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: "checks/out/ranges-detail.png" });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("no sideways scrolling on a phone", !overflow);

await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
