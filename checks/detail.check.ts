// Opening a portfolio: it grows across the grid in place, shows its detail
// (biggest bump, taxes, holdings over time with events, holdings, timeline),
// and shrinks back on save, cancel or Escape.
// Needs a confirmed paid throwaway account with no comparison:
//   CREDS="email password" npx tsx checks/detail.check.ts   (with `npx vite preview --port 4173` running)
import { chromium, type Page } from "playwright-core";

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
// Positions on the page (not the screen), so scrolling doesn't matter.
const box = (p: Page, sel: string) =>
  p.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, width: r.width, height: r.height };
  });
const expanded = (slot: number) => page.locator(`[data-testid="col-${slot}"][data-expanded]`).count().then((n) => n === 1);

await page.goto(`${BASE}signin`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.getByText(/How much would you invest/).waitFor({ timeout: 60_000 });
await page.click('button:has-text("Next")');
await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });
await page.locator('input[type="radio"]').nth(1).check();
await page.fill('input[aria-label="Start date"]', "2015-01-02");
await page.fill('[data-testid="setup-2-ticker-0"]', "QQQ");
await settle();
await page.click('[data-testid="setup-col-2"] button:has-text("Add another")');
await page.fill('[data-testid="setup-2-ticker-1"]', "SNOW");
await settle();
await page.fill('[data-testid="setup-3-ticker-0"]', "NVDA");
await settle();
await page.click('button:has-text("Run the what-if")');
await page.getByText(/What-if: chosen with hindsight/).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1200);

check("the button now says View/Edit", (await page.innerText('[data-testid="col-2-open"]')) === "View/Edit");
const grid = await box(page, '[data-testid="col-1"]');
const before3 = await box(page, '[data-testid="col-3"]');

// Clicking the tile itself (not a button) opens it.
await page.locator('[data-testid="col-2"] [data-testid="col-2-value"]').click();
// Mid-animation picture.
await page.waitForTimeout(170);
await page.screenshot({ path: "checks/out/detail-opening.png" });
await page.waitForTimeout(700);
check("clicking the tile opens it", await expanded(2));
const open2 = await box(page, '[data-testid="col-2"]');
const after1 = await box(page, '[data-testid="col-1"]');
const after3 = await box(page, '[data-testid="col-3"]');
check("it spans the whole grid", open2.width > grid.width * 2.5, `${Math.round(open2.width)}px`);
check("portfolio 1 stays above it", after1.bottom <= open2.top + 1 && Math.abs(after1.top - grid.top) < 2);
check("portfolio 3 is pushed below it", after3.top >= open2.bottom - 1 && after3.top > before3.top);

const text = await page.innerText('[data-testid="col-2"]');
check("shows Biggest bump next to Biggest drop", /Biggest bump/.test(text) && /Biggest drop/.test(text));
const potential = Number((await page.innerText('[data-testid="tax-potential-amount"]')).replace(/[^0-9]/g, ""));
check("estimates tax if sold today", potential > 0, `$${potential}`);
check("tax owed so far is $0 with the reason", (await page.innerText('[data-testid="tax-actual-amount"]')) === "$0" && /Nothing has been sold yet/.test(text));
const markers = await page.locator('[data-testid="col-2"] [data-testid="detail-marker"]').allInnerTexts();
check("the chart marks the start, SNOW's wait and its buy-in", markers.includes("Start · SNOW in cash") && markers.includes("SNOW bought"), markers.join(" | "));
const legend = await page.innerText('[data-testid="col-2"] [data-testid="detail-legend"]');
check("the key names each holding", /QQQ/.test(legend) && /SNOW/.test(legend));
// One line per holding, each starting the day it was bought.
const lines = await page.locator('[data-testid="col-2"] [data-testid="detail-line"]').evaluateAll((els) =>
  els.map((e) => ({ series: e.getAttribute("data-series"), from: e.getAttribute("data-from") })),
);
const lineFrom = (s: string) => lines.find((l) => l.series === s)?.from;
check("QQQ's line starts at the start date", lineFrom("QQQ") === "2015-01-02", JSON.stringify(lines));
check("SNOW's line starts the day it was bought", lineFrom("SNOW") === "2020-09-16", String(lineFrom("SNOW")));
check("cash is its own line, while it waited", lineFrom("Cash") === "2015-01-02");
const labels = await page.locator('[data-testid="col-2"] [data-testid="detail-marker"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
check("marker labels don't overlap", labels.every((a, i) => labels.every((c, j) => i >= j || a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top)));
check("the holdings table lists both", /QQQ/.test(await page.innerText('[data-testid="col-2"] [data-testid="detail-holdings"]')) && /SNOW/.test(await page.innerText('[data-testid="col-2"] [data-testid="detail-holdings"]')));
const timeline = await page.innerText('[data-testid="col-2"] [data-testid="detail-timeline"]');
check("the timeline tells the story", /Bought QQQ 50% · SNOW 50%/.test(timeline) && /SNOW started trading/.test(timeline), timeline.replace(/\n/g, " / "));
// Hover the chart for a day's values.
const cb = await box(page, '[data-testid="col-2"] [data-testid="detail-chart"]');
await page.locator('[data-testid="col-2"] [data-testid="detail-chart"]').hover({ position: { x: cb.width * 0.3, y: cb.height / 2 } });
check("hovering the chart shows that day's values", (await page.locator('[data-testid="col-2"] [data-testid="detail-chart"] [role="status"]').count()) === 1);
await page.screenshot({ path: "checks/out/detail-open.png", fullPage: true });
await page.mouse.move(5, 5);

// Cancel shrinks it back.
await page.click('[data-testid="col-2-cancel"]');
await page.waitForTimeout(800);
check("Close/Cancel shrinks it back", !(await expanded(2)));
const back2 = await box(page, '[data-testid="col-2"]');
check("…to where it was", Math.abs(back2.width - grid.width) < 2);

// Edit and save from the open view.
await page.click('[data-testid="col-3-open"]');
await page.waitForTimeout(800);
check("View/Edit opens it", await expanded(3));
check("Save is off until something changes", await page.locator('[data-testid="col-3-save"]').isDisabled());
await page.fill('[data-testid="edit-3-ticker-0"]', "AMD");
await settle();
await page.click('[data-testid="col-3-save"]');
await page.locator('[data-testid="col-3-mix"]:has-text("AMD")').waitFor({ timeout: 30_000 });
await page.waitForTimeout(800);
check("saving shrinks it back with the new mix", !(await expanded(3)));

// Escape closes.
await page.click('[data-testid="col-1-open"]');
await page.waitForTimeout(700);
check("portfolio 1 opens too", await expanded(1));
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
check("Escape closes it", !(await expanded(1)));

// Phone.
await page.setViewportSize({ width: 375, height: 800 });
await page.click('[data-testid="col-2-open"]');
await page.waitForTimeout(900);
check("on a phone it fits the screen", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await page.screenshot({ path: "checks/out/detail-phone.png", fullPage: true });

await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
