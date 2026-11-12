/**
 * Focused viewport + accessibility pass.
 * Split out of visual.check.ts because the long single run kept hitting the
 * 240s wall before reaching the narrow-viewport checks.
 */
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "/tmp/shots2";
const errors: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) errors.push(name);
}

async function overflow(page: Page) {
  return page.evaluate(() => ({
    over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    w: document.documentElement.scrollWidth,
    c: document.documentElement.clientWidth,
  }));
}

async function main() {
  const browser = await chromium.launch({
    executablePath: `${process.env.HOME}/.pw/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"]', "resp@example.com");
  await page.fill('input[autocomplete="name"]', "Resp");
  await page.fill('input[type="password"]', "ledger123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // Comparison at each width.
  for (const [w, h, label] of [
    [320, 720, "320"],
    [390, 844, "390"],
    [768, 1024, "768"],
    [1440, 900, "1440"],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const o = await overflow(page);
    check(`no horizontal overflow at ${label}`, !o.over, `${o.w}/${o.c}`);
    await page.screenshot({ path: `${OUT}/comparison-${label}.png`, fullPage: true });
  }

  // Portfolio detail at phone width: the trade ticket is the risk area.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.click("table tbody tr:first-child a");
  await page.waitForTimeout(1200);
  const oDetail = await overflow(page);
  check("no horizontal overflow on detail at 390", !oDetail.over, `${oDetail.w}/${oDetail.c}`);

  // Tap targets: the three mode tabs must be reachable without hover.
  const tabBox = await page.getByRole("button", { name: "Add cash", exact: true }).boundingBox();
  check(
    "Add cash tab is a usable touch target",
    !!tabBox && tabBox.height >= 24,
    tabBox ? `${tabBox.width.toFixed(0)}x${tabBox.height.toFixed(0)}` : "missing",
  );
  await page.screenshot({ path: `${OUT}/detail-390.png`, fullPage: true });

  // Keyboard reachability: repeated Tab must land on real interactive controls,
  // and focus must be visible. Tabbing twice and asserting a tag name is brittle.
  const reached: string[] = [];
  let sawOutline = false;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return { tag: "", outline: "" };
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        name: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 28),
        outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
      };
    });
    if (["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(info.tag)) {
      reached.push(`${info.tag}:${info.name}`);
      if (info.outline.includes("solid") && !info.outline.startsWith("none")) {
        sawOutline = true;
      }
    }
  }
  check("keyboard reaches interactive controls", reached.length >= 3, reached.slice(0, 4).join(", "));
  check("focus is visibly outlined", sawOutline);

  // Reduced motion keeps the chart.
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page2.emulateMedia({ reducedMotion: "reduce" });
  await page2.goto(BASE, { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(1200);
  // A fresh context has no session: sign in so the chart actually renders.
  await page2.fill('input[type="email"]', "rm@example.com");
  await page2.fill('input[autocomplete="name"]', "RM");
  await page2.fill('input[type="password"]', "ledger123");
  await page2.click('button[type="submit"]');
  await page2.waitForTimeout(2200);
  const paths = await page2.locator("svg path[stroke]").count();
  check("chart renders with reduced motion", paths >= 3, `${paths} paths`);
  await page2.screenshot({ path: `${OUT}/reduced-motion.png`, fullPage: true });

  check("no uncaught page errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  await browser.close();
  console.log(errors.length ? `\nFAILURES: ${errors.join(", ")}` : "\nall viewport checks passed");
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("harness crashed:", e);
  process.exitCode = 1;
});
