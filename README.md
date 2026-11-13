# Ledger: the same dollars, different paths

A personal paper-trading tool for seeing what real investing might look like. You say how much you'd invest (a starting amount and a weekly amount), then compare up to three portfolios that each get that same money. Portfolio 1 starts as the whole US market (VTI). Portfolios 2 and 3 are yours to fill: one ticker, or a mix with percentages.

- **Start date: Today** (the default) builds a real record. Money is invested at the next market close, at prices nobody knew when you decided.
- **Start date in the past** replays history as a clearly labelled *what-if*. It's useful for seeing what would have happened, but the choices are made with hindsight.
- **Changing a mix** later moves all of that portfolio's money into the new mix at the next close and is logged with an optional note. Weekly deposits follow the current mix.
- Return is always shown next to the biggest drop and volatility, both measured with deposits taken out.

Accounts are private: see the sign-up gate below. Data lives in Supabase and syncs across devices. Prices are daily adjusted closes from Tiingo, fetched and cached on the server. [docs/BUILD-RECORD.md](docs/BUILD-RECORD.md) holds the original research.

## Run locally

```bash
npm install
npm run dev        # development server
npm run build      # production build
```

The app talks to the live Supabase project by default. To point it at another project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. `test/fixtures/prices.json` (59 tickers from 2019, from the original build) is used only by the tests.

## Known issues (from the November 2026 review)

1. ~~**Trades can use hindsight.**~~ Fixed: an order records when it was placed and fills at the first market close after that moment. Until that close is in the data it shows as pending and its cash is held.
2. ~~**Volatility and drawdown include contributions.**~~ Fixed: both are measured on time-weighted returns. VTI/BND from 2023 now shows 10.4% volatility and a −12.7% max drawdown.
3. ~~**Only one time window is shown.**~~ Replaced by the start-date picker: any date back to January 2000 can be replayed as a what-if (prices now go back to 2000).
4. ~~**Data is stored in the browser only.**~~ Fixed: accounts, portfolios and orders are stored in Supabase.
5. ~~**Target weights never rebalance.**~~ Changing a mix now moves all of a portfolio's money into it at the next close. Between changes, a mix still drifts as prices move; it isn't topped back up automatically.

## Server (Supabase)

- `supabase/migrations/`: the schema, row-level security, `price_series`, and the nightly schedule.
- `supabase/functions/prices`: signed-in users ask for tickers. Any that are missing or stale are fetched from Tiingo (adjusted closes) and cached. The Tiingo key stays on the server.
- `supabase/functions/nightly-close`: runs at 20:30 New York time on weekdays, scheduled by pg_cron. It refreshes the tickers in use, then fills or rejects pending orders by running the app's own engine.
- `supabase/functions/signup`: the only way to create an account (this is a private site). The password must contain a secret word kept in Supabase Vault (`signup_gate_word`), or the reply is "this is not a public site for use". A trigger on `auth.users` refuses any account that didn't come through this function. To change the word, update that Vault secret.
- `supabase/functions/_shared/engine.js` is **generated**. After changing anything in `src/lib` or `src/server`, run `npm run build:engine` and redeploy both functions.

## Tests

```bash
npm test           # vitest: fills, pending orders, market clock, time-weighted metrics,
                   # settlement, Tiingo parsing and refresh rules
```

`checks/e2e.check.ts` drives the built app in headless Chrome against the live project. It needs a confirmed throwaway account with no portfolios; see the comment at the top of the file.

## Layout

- `src/lib/ledger.ts` — valuation engine: cash flows, order fills, time-weighted drawdown and volatility
- `src/lib/market.ts` — market clock (16:00 New York close, daylight saving aware)
- `src/lib/prices.ts` — price index and close lookups
- `src/lib/store.ts` — storage (browser localStorage for now)
- `src/pages/`, `src/components/` — user interface
- `checks/` — invariant checks for the ledger maths, plus browser checks run with Playwright
- `docs/` — research, the build record and screenshots
