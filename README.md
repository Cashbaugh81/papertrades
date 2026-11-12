# Ledger: the same dollars, different paths

A personal paper-trading tool. Start with one amount of cash and one monthly contribution, run several portfolios side by side on exactly the same dollars, and watch how far apart they end up. Return is always shown next to drawdown, volatility and the time window it was measured over.

This first commit is the code and research as they were brought over from an earlier platform, with no changes yet. See [docs/BUILD-RECORD.md](docs/BUILD-RECORD.md) for the research and how the first version was built.

## Run locally

```bash
npm install
npm run dev        # development server
npm run build      # production build
```

Prices are read from `data/prices.json`: daily adjusted closes for 59 tickers, starting 2019-01-02, from Yahoo via yfinance.

## Known issues (from the November 2026 review), to fix next

1. **Trades can use hindsight.** Orders fill at the latest close in the bundled file, which may be days old. They should wait and fill at the next close after the order is placed, and past dates should not be allowed.
2. **Volatility and drawdown include contributions.** Monthly deposits count as gains, which overstates volatility and understates drawdown. For example, VTI/BND from 2023 shows 13.3% volatility instead of 10.4%, and a −9.5% max drawdown instead of −12.7%. These should be calculated on flow-adjusted (time-weighted) returns.
3. **Only one time window is shown, and the data starts in 2019.** The research's own rule says to show at least two windows side by side, including 2000–2008.
4. **Data is stored in the browser only.** Nothing syncs between devices.
5. **Target weights never rebalance.** They only apply to new contributions, so concentrated portfolios drift over time.

## Layout

- `src/lib/ledger.ts` — valuation engine: cash flows, fills, drawdown, volatility
- `src/lib/prices.ts` — price index and close lookups
- `src/lib/store.ts` — storage (browser localStorage for now)
- `src/pages/`, `src/components/` — user interface
- `checks/` — invariant checks for the ledger maths, plus browser checks run with Playwright
- `docs/` — research, the build record and screenshots
