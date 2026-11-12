# Evidence Log v1 — Parallel Portfolio / Paper Trading Platform
Date: 2026-11-12. All sources read via web search snippets; none paywalled-verified beyond snippet text.

## 1. Direct competitors (paper trading + education)

- **Invstr** (founded 2013). Fantasy Finance with $1M virtual money, 85-lesson academy, then real trading
  from $5 via DriveWealth. Pro $3.99/mo. Claims 800k+ community members / "100,000+ users" on the Academy
  app listing. Sources: dividendscope.com/reviews/invstr; started.inf.uniroma3.it company listing.
  → This is the closest existing product to the stated idea, and it is 13 years old, small, and priced at $4.
- **HowTheMarketWorks / StockTrak / Personal Finance Lab / Virtual-Stock-Exchange** (Stock-Trak Inc.,
  27+ years). Free, real-time data, custom contests with configurable starting cash and rules, teacher
  dashboards, embedded lessons, trade notes. Claims 10k-20k teachers and 200k-475k students/year.
  Sources: howthemarketworks.com; content.stocktrak.com HTMW-Promo.pdf; learn.stocktrak.com.
  → Multiple concurrent portfolios with custom starting cash already exists here. Free.
- **TradingView** paper trading — free, no brokerage needed, multiple paper accounts, chart-native.
  Source: pineify.app; aistocktradingbots.com.
- **thinkorswim paperMoney** (Schwab) — free with Schwab account, $100k simulated buying power, options
  and futures, real-time data. Source: snappchart.app; tradiecapital.com.
- **Webull** paper trading — free, no PDT limits. **Interactive Brokers**, **Alpaca** — free simulated
  accounts, API-reachable.
  → Baseline expectation is now $0 for a realistic simulator with live data.

## 2. Adjacent: education-first investing apps that monetise by subscription

- **Alinea Invest**: $120/yr subscription, SEC-registered RIA, DriveWealth rails, "playlists" of stocks,
  conversational education. 
  - Apr 2025 (Forbes): 1M+ users, 92% women, 70% Gen Z, avg age 22; $6M net revenue run rate; 10 staff;
    6x YoY revenue growth in 2024; $10.4M Series A led by Play Ventures.
  - Feb 2026 (company press release): 2M+ downloads; secured $22.5M UA financing from PvX Partners.
  - TechRound (Feb 2026): "4x YoY growth in 2025", ">$2M users", "$4.8M net revenue in January 2026".
  → Implied: roughly $3/download/year in net revenue. To reach $1M ARR at $10/mo you need ~8,300 payers;
  at a 5% freemium conversion that implies ~166,000 registered users. (Inference, not a reported figure.)
- **Acorns** $3/$6/$12 mo; **Stash** $3/$9 mo; **Bloom** $15/mo or $99.99/yr with lessons and stock rewards;
  **Wizest** $8/$15 mo. Sources: businessinsider.com Stash review; pricelesstay.com Bloom review; App Store.
- **Portfolio Visualizer** — the "compare strategies" job, done for people who already invest. Free tier
  limited to 15 assets / restricted history; Basic $30/mo, Pro $55/mo billed annually. Does not do live
  day-by-day shadow portfolios.
  Sources: findmymoat.com; alltradingtools.com; portfolioslab.com comparison.
  → The comparison mechanic is a paid, validated job — but for adults with portfolios, not beginners.

## 3. Does simulation actually change anything? (the product's core claim)

- **Anginer, Piza, Ray & Xu, "Trading Simulations and Real Money Outcomes," Journal of Behavioral Finance
  25(4), 2024** (Brazilian simulator data): more active simulator users, and those with the best *stock-level*
  performance, were more likely to open real accounts, traded more, and **significantly underperformed** in
  real money. Conclusion: without education about the hazards of active trading and accurate performance
  evaluation, simulator users draw incorrect inferences about their own skill.
  → Directly threatens the product's promise. The simulator teaches the wrong lesson by default.
- **Sui & Wang, "Stakes and Investor Behaviors" (SSRN 4219861, 2022)**: same investors in real and simulated
  accounts — biases are **stronger** at higher stakes but **strongly positively correlated** across the two.
  → Supports the diagnostic premise: simulated behaviour is informative. Weakens "it's a completely
  different animal."
- **Martelli (2013), Qualitative Research in Financial Markets**: simulation did not significantly improve
  team performance; teams became more speculative as the end of the competition approached.
- **Şenol (2023, Boğaziçi PhD) / Journal of Behavioral and Experimental Finance 37 (2023) 100772**:
  participating in a stock market game significantly *decreased* overconfidence and disposition effect, but
  *increased* familiarity and status-quo bias. Effects scale with activity level.
  → Mixed but real: the mechanism you're betting on does move behaviour, in both directions.
- Elliott Wave / Prechter: paper trading "of no value in learning about trading... can be detrimental"
  because it builds false confidence. (Opinion, not research — flagged as such.)

## 4. Market-size figures — DO NOT USE

- QYResearch: "Virtual Trading Apps" $301M (2025) → $464M (2032) at 6.5% CAGR.
- QYResearch, same publisher, different report: "Stock Market Simulator" $1.34B (2025) → $3.56B (2032) at 15.2%.
- GlobalInfoResearch: "Virtual Trading Apps" $447M by 2031 at 6.3%.
These are syndicated estimates that disagree with each other by 4x on adjacent definitions. Treat as
unreliable. No credible bottom-up figure found for "people who would pay for simulated portfolio comparison."

## 5. Not found (gaps)

- No credible public benchmark for **retention of paper-trading / simulated-investing apps**. Searched;
  the numbers floating around (e.g. "9% 90-day retention for learning apps") trace to SEO content farms,
  not primary data. This is the single biggest unknown and cannot be resolved by desk research.
- No public CAC figure for investing-education apps.
- No data on whether users value *parallel* portfolios vs one portfolio with a benchmark overlay.

---

# Addendum — market data feasibility, tested 2026-11-12

## Live tests (not vendor claims)
| Test | Result |
|---|---|
| yfinance, 6 tickers, 2021->today | 1,472 rows, 6 cols, zero missing days, 0.4s |
| yfinance, 60 tickers, 3 years, one call | 969 rows x 60, no empty cols, 1.4s |
| yfinance intraday 5m | 78 bars for current session |
| yfinance dividends/splits | SPY quarterly dividends returned; folded into adjusted close |
| Stooq quote CSV | HTTP 404 |
| Stooq daily history CSV | JS proof-of-work challenge, not CSV |

## Documented free-tier limits (from provider pages, checked 2026-11)
- Alpha Vantage: 25 requests/day, 5/min. Paid $49.99/mo = 75/min.
- Finnhub: 60 calls/min, personal-use licence, thin free history.
- Twelve Data: 8 credits/min, 800/day. Paid from $29/mo.
- Tiingo: 50/hr, 1,000/day, 500 symbols/mo. "Internal Use Only" licence. Power $30/mo.
- Polygon/Massive Basic: 5 calls/min, END OF DAY only, 2 years history, individual use. Starter $29/mo = 15-min delayed.
- Alpaca Basic: 200 calls/min, real-time IEX + SIP history older than 15 min.
- IEX Cloud: shut down 2024-08-31.

## Assumption A8 (added)
The market-data layer is the only component that can fail for reasons outside the builder's control,
and its free tier's licence — not its rate limit — is what constrains the product later.
Status: rate limits are irrelevant at this workload size (daily refresh). Licence is the real constraint.

## IMPORTANT — my own claim failed a test
I asserted in the draft that the ranking reverses across windows. Tested it:
- 2000-07 -> 2008-12: chip -47.8%, healthcare -3.8%, SPY -19.7%  (chip LAST — reversal confirmed)
- 2009-01 -> today: chip 108.3x, healthcare 10.4x, SPY 3.8x      (chip first by 28x)
- 2023-01 -> today: chip 3.16x, healthcare 0.64x, SPY 0.61x      (chip first)
So: the reversal is real but window-specific, and two of three windows put chip first.
Also discovered: VTI starts 2001, BND starts 2007, SMH 2000-06. Any backtest starting 2000 with
60/40 silently deletes the crash window — a tool can lie by ticker inception alone.
Correction applied to the delivered workbook.
