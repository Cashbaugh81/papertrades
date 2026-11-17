// Landing page 2 (/lp2): the four "what if" stories load, switch and auto-advance.
// Run with `npx vite preview --port 4173`: npx tsx checks/lp2.check.ts
import { chromium } from "playwright-core";
const B = "http://localhost:4173/papertrades/lp2";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--headless=new"] });
for (const [w, h, name] of [[1440, 900, "d"], [375, 812, "m"]] as const) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(B);
  const sec = p.locator('[data-testid="whatif"]');
  await sec.scrollIntoViewIfNeeded();
  await p.mouse.move(1, 1);
  await p.waitForTimeout(800);
  await sec.screenshot({ path: `checks/out/whatif-${name}-1.png` });
  console.log(name, await p.innerText('[data-testid="whatif-title"]'), await p.innerText('[data-testid="whatif-worth"]'));
  for (const k of ["gme", "dpz"]) {
    await p.click(`[data-testid="whatif-pick-${k}"]`);
    await p.waitForTimeout(700);
    console.log(name, k, await p.innerText('[data-testid="whatif-worth"]'));
    await sec.screenshot({ path: `checks/out/whatif-${name}-${k}.png` });
  }
  const ok = await p.locator('[data-testid="whatif-photo"]').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0);
  console.log(name, "photo loaded", ok, "page width ok", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
// the "You" slide: a ticker box, three made-up futures, and a CTA that names the ticker
{
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(B);
  await p.click('[data-testid="whatif-pick-you"]');
  await p.fill('[data-testid="whatif-ticker-input"]', "tsla");
  console.log("you: input upper-cases", (await p.inputValue('[data-testid="whatif-ticker-input"]')) === "TSLA");
  console.log("you: three futures", (await p.locator('[data-testid^="whatif-future-"]').count()) === 4); // chart + 3 labels
  console.log("you: CTA names it", (await p.innerText('[data-testid="whatif-you-cta"]')) === "Track TSLA with pretend money");
  await p.click('[data-testid="whatif-you-cta"]');
  await p.waitForURL(/\/start$/);
  console.log("you: CTA goes to sign-up", p.url().endsWith("/start"));
}
// autoplay: away from the section, it should move on after 7s
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(B);
const t0 = await p.innerText('[data-testid="whatif-title"]');
await p.waitForTimeout(10600);
console.log("autoplay moved:", t0 !== (await p.innerText('[data-testid="whatif-title"]')));
await b.close();
