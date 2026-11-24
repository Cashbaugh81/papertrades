// Live purchase prices: during market hours, a live comparison buys its stocks
// and ETFs at live prices (mutual funds at the close). Run while the market is open.
// Needs a confirmed paid throwaway account with no comparison:
//   CREDS="email password" npx tsx checks/live.check.ts   (with `npx vite preview --port 4173` running)
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
await page.click('button:has-text("Next")');
await page.getByText(/Choose your portfolios/).waitFor({ timeout: 20_000 });

await page.fill('[data-testid="setup-2-ticker-0"]', "NVDA");
await settle();
await page.click('[data-testid="setup-col-2"] button:has-text("Add another")');
await page.fill('[data-testid="setup-2-ticker-1"]', "VTSAX");
await settle();
await page.getByText(/a share \(live,/).first().waitFor({ timeout: 20_000 }).catch(() => {});
const col = await page.innerText('section[data-testid="setup-col-2"]');
check("the Shares box uses NVDA's live price", /NVIDIA[\s\S]*a share \(live, \d+:\d\d [AP]M ET\)/.test(col), col.replace(/\n/g, " | "));
check("a mutual fund shows its latest close", /a share \(latest close\)/.test(col));
await page.screenshot({ path: "checks/out/live-setup.png" });

await page.click('button:has-text("Start from today")');
await page.getByText(/Bought at live prices at/).first().waitFor({ timeout: 60_000 });
const card2 = await page.innerText('[data-testid="col-2"]');
check("the card says it bought at live prices", /Bought at live prices at \d+:\d\d [AP]M ET: NVDA \$[\d,.]+\./.test(card2), card2.replace(/\n/g, " | "));
check("the fund buys at today's close", /VTSAX buys at today's close/.test(card2));
const card1 = await page.innerText('[data-testid="col-1"]');
check("portfolio 1 (VTI) too", /Bought at live prices at .*VTI \$/.test(card1));
await page.screenshot({ path: "checks/out/live-dashboard.png" });

await b.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
