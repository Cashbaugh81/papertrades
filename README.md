# Ledger: the same dollars, different paths

A personal paper-trading tool. Start with one amount of cash and one monthly contribution, run several portfolios side by side on exactly the same dollars, and watch how far apart they end up. Return is always shown next to drawdown, volatility and the time window it was measured over.

This first commit is the code and research as they were brought over from an earlier platform, with no changes yet. See [docs/BUILD-RECORD.md](docs/BUILD-RECORD.md) for the research and how the first version was built.

## Run locally

```bash
npm install
npm run dev        # development server
npm run build      # production build
```

Prices are read from `public/data/prices.json`: daily adjusted closes for 59 tickers, starting 2019-01-02, from Yahoo via yfinance.

## Known issues (from the November 2026 review)

1. ~~**Trades can use hindsight.**~~ Fixed: an order records when it was placed and fills at the first market close after that moment. Until that close is in the data it shows as pending and its cash is held.
2. ~~**Volatility and drawdown include contributions.**~~ Fixed: both are measured on time-weighted returns. VTI/BND from 2023 now shows 10.4% volatility and a −12.7% max drawdown.
3. **Only one time window is shown, and the data starts in 2019.** The research's own rule says to show at least two windows side by side, including 2000–2008.
4. **Data is stored in the browser only.** Nothing syncs between devices.
5. **Target weights never rebalance.** They only apply to new contributions, so concentrated portfolios drift over time.

## Server (Supabase)

- `supabase/migrations/`: the schema, row-level security, `price_series`, and the nightly schedule.
- `supabase/functions/prices`: signed-in users ask for tickers. Any that are missing or stale are fetched from Tiingo (adjusted closes) and cached. The Tiingo key stays on the server.
- `supabase/functions/nightly-close`: runs at 20:30 New York time on weekdays, scheduled by pg_cron. It refreshes the tickers in use, then fills or rejects pending orders by running the app's own engine.
- `supabase/functions/_shared/engine.js` is **generated**. After changing anything in `src/lib` or `src/server`, run `npm run build:engine` and redeploy both functions.

## Tests

```bash
npm test           # vitest: fills, pending orders, market clock, time-weighted metrics,
                   # settlement, Tiingo parsing and refresh rules
```

## Layout

- `src/lib/ledger.ts` — valuation engine: cash flows, order fills, time-weighted drawdown and volatility
- `src/lib/market.ts` — market clock (16:00 New York close, daylight saving aware)
- `src/lib/prices.ts` — price index and close lookups
- `src/lib/store.ts` — storage (browser localStorage for now)
- `src/pages/`, `src/components/` — user interface
- `checks/` — invariant checks for the ledger maths, plus browser checks run with Playwright
- `docs/` — research, the build record and screenshots
