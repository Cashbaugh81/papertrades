# Ledger — Build Record and Research Report

**Date:** 12 November 2026
**Status:** Working web app live; research complete for first pass; two blockers outstanding
**Prepared for:** Chris Ashbaugh

This document is the consolidated record of a one-day engagement: a research pass on a product idea, a working implementation of it, and an honest account of what was verified, what failed testing, and what remains blocked.

**Contents**

1. The idea
2. Research findings — assumptions, competitors, evidence
3. The kill test
4. The working application
5. Verification — what was actually tested
6. Bugs found by testing, and fixed
7. Market data — tested, not assumed
8. Blockers, stated plainly
9. Honest assessment

---

## 1. The idea

A consumer tool where a beginner enters cash on hand and a monthly contribution, then runs several portfolios side by side against the **same** dollars — a boring index mix, a concentrated semiconductor bet, a healthcare basket — and watches them diverge over time.

The stated purpose: show people what their own investing urges would have cost them, before it is real money.

Two decisions were made early and held throughout:

1. **The window is part of the comparison, not a setting.** A performance figure without its measurement window is a lie by omission.
2. **Return alone is not enough.** Drawdown and volatility sit beside return, because a strategy that returns the most while falling the furthest teaches the wrong lesson.

---

## 2. Research findings

### 2.1 The assumption most likely to be false

Of seven assumptions identified, one was flagged as load-bearing and most likely to fail:

> **A1.** Beginners will return to a simulator weekly for eight or more weeks without a cash incentive.

The product's entire value appears only after multi-week divergence. Before week six there is nothing to see: no brokerage profit-and-loss, no order flow, no prize. If this assumption is false, everything else is irrelevant.

Two supporting risks were logged alongside it:

- **A2.** Being shown your own bad instincts may be a quitting experience, not a retaining one. The core loop's emotional payoff is a mild weekly reprimand delivered by software.
- **A3.** People may prefer to pay a broker for execution rather than pay a subscription for diagnosis. Every incumbent is free at the point of use because the broker monetises the account.

### 2.2 Competitive position

The comparison mechanic already exists, mostly free:

| Product | Position |
|---|---|
| HowTheMarketWorks / StockTrak | Multiple concurrent portfolios with custom starting cash. Free. 27+ years operating. |
| TradingView | Free paper trading, multiple paper accounts, chart-native. |
| thinkorswim paperMoney | Free with a Schwab account, $100k simulated buying power, real-time data. |
| Invstr | Closest existing product to the idea. 13 years old, priced at $3.99/month, small. |
| Alinea Invest | Subscription education-first investing, $120/year, 2M+ downloads. |

**Inference, labelled as such:** the moat in this category is distribution and retention, not features. Any competitor can ship parallel shadow ledgers in a sprint.

### 2.3 Does simulation actually change behaviour

This is the product's core claim, and the evidence was mixed in a way that matters:

- **Anginer, Piza, Ray & Xu (Journal of Behavioral Finance, 2024)**, using Brazilian simulator data: the most active simulator users, and those with the best stock-level performance, were *more* likely to open real accounts and trade more — and **significantly underperformed** in real money. Without education about the hazards of active trading, simulator users draw incorrect inferences about their own skill.
- **Sui & Wang (SSRN 4219861, 2022)**: comparing the same investors in real and simulated accounts, biases are stronger at higher stakes but **strongly positively correlated** across the two. This supports the diagnostic premise.
- **Şenol (2023)**: participating in a stock market game significantly *decreased* overconfidence and the disposition effect, but *increased* familiarity and status-quo bias.

**What this means for the product:** the mechanism being bet on does move behaviour, in both directions. The simulator teaches the wrong lesson by default unless the framing actively prevents it. That is a design constraint, not a footnote.

### 2.4 Market-size figures — deliberately excluded

Three syndicated estimates for the same adjacent categories disagreed with each other by a factor of four on adjacent definitions. They were logged as unreliable and not used. No credible bottom-up figure was found for "people who would pay for simulated portfolio comparison."

### 2.5 The biggest unknown

No credible public benchmark exists for **retention of paper-trading apps**. The numbers circulating trace to search-optimised content farms, not primary data. This is the single largest unknown and **cannot be resolved by desk research** — which is precisely why the kill test below was designed to cost almost nothing.

---

## 3. The kill test

Designed to falsify A1 for a few hundred pounds of effort rather than six weeks of engineering.

**Method:** no product. Recruit 12–15 people matching the target user exactly — 22–35, has investable cash idle, has considered buying individual stocks in the last 90 days but has not. For each, by hand: ask their cash and monthly figure, build three parallel portfolios, and send a weekly one-page note on Sunday evening showing how their three would have done. Offer nothing else. No lessons, no gamification, no reminders.

**Measured:** week-four reply rate; whether they ask an unprompted question ("why is the chip one down so much?"); whether they ask to put real money somewhere; whether they ask to continue past week four.

**Kill criteria:**

- Fewer than 5 of 12 still engaging at week four → the loop does not hold attention. Stop, or find a version with a much faster payoff.
- People engage but never ask about real money → a toy, not a bridge to investing.
- People engage and ask "can you just tell me what to buy" → an advice product wearing an education costume, which is a licensing problem, not a design problem.

**Testing status: not yet run.** This is the single most valuable unfinished item in the whole engagement.

---

## 4. The working application

A live web app was built and deployed: **Ledger — the same dollars, different paths**.

### 4.1 What it does

- Sign up and sign in, with three example portfolios seeded from three years of real market history.
- An after-close comparison view: headline figures, a parallel-path chart with one line per portfolio, and a spread table showing each portfolio's distance from the baseline.
- A per-portfolio detail view with holdings, max drawdown, volatility, path chart, and a decision log.
- A trade ticket to buy or sell inside a portfolio, with an optional note recording the reasoning.
- A consolidated decisions page listing every trade across every portfolio.

### 4.2 The valuation model, stated plainly

- Trades fill at the **closing price** of the trading day they are dated. This is a post-close review tool, so that is the price you would have received.
- **No fees, slippage, tax, or interest.** Deliberate: the comparison is about decisions, so every other variable is held fixed.
- Contributions are treated as an **external cash flow**, tracked separately as "money put in", so saving never masquerades as performance.
- Monthly contributions are **deployed immediately** pro-rata to each portfolio's weights. Leaving them in cash would make the comparison a measurement of hoarding rather than of investment decisions.
- Fractional units throughout.

### 4.3 Design direction

Named **"Warm ledger"**: a personal set of books, not a trading terminal. Paper background, hairline rules instead of cards, tabular figures throughout, red and green used only for meaning. Three signature elements: the parallel-path chart, the spread bar drawn from a centre line, and the decision log formatted like a bank statement. Nothing animates without the user acting.

---

## 5. Verification — what was actually tested

A passing build proves compilation, not correctness. Both layers were tested.

### 5.1 Ledger arithmetic (19 automated invariant checks)

| Check | Result |
|---|---|
| Initial capital is not auto-invested; explicit buys allocate it | Pass |
| Unspent cash preserved, not silently invested | Pass |
| Portfolio value equals units × price plus cash | Pass |
| Unfundable buy is **rejected**, never clamped to negative cash | Pass |
| Rejected buy leaves cash untouched and creates no value | Pass |
| Overselling liquidates only what is held | Pass |
| Monthly deposits counted as money in, not as return | Pass |
| Flat price plus contributions shows **zero** phantom return | Pass |
| Weighted contributions leave no idle cash | Pass |
| Deploying deposits changes the result measurably | Pass |
| Drawdown is measured peak-to-trough and is non-positive | Pass |
| A portfolio starting later does not claim earlier history | Pass |

### 5.2 Browser behaviour (real headless Chromium, production build)

Seventeen checks across sign-up, trading, persistence, and layout: sign-in renders; the chart draws; the comparison table populates; a recorded trade appears in the log and survives a reload; an unfundable buy is blocked in the form; no horizontal overflow at 320, 390, 768, or 1440 pixels; touch targets are usable; keyboard focus is visible; the chart still renders under reduced-motion; no uncaught page errors.

**All passed against the production build.** An earlier run against the development server reported Vite's hot-reload socket as a console error — confirmed as a dev-only artefact by the production run being clean.

---

## 6. Bugs found by testing, and fixed

These are recorded because they are the evidence that the testing was real. None would have appeared in a build log.

1. **Monthly deposits were never invested.** A portfolio could show $28,000 contributed while holding $18,000 in idle cash. The "comparison" was partly a measurement of cash weighting.
2. **Fixing that created a dead end.** Deploying every deposit left zero cash, so the buy button was permanently disabled with no route forward. Caught only by driving the real interface. Resolved by adding an "Add cash" path.
3. **Seeded trades were rejected on day one.** Capital was auto-deployed *and* the seeded buys tried to spend it — six rejections across three portfolios, with no prices to blame.
4. **The detail page overflowed to 475px on a 390px phone.** Two attempts were needed: wrapping the tables in a scroll container was insufficient, because CSS grid children default to `min-width: auto` and force the column wide regardless.

Additionally, **one of my own research claims failed when tested.** I had asserted that the portfolio ranking reverses across time windows. On measurement, the reversal is real but window-specific — two of three windows put the semiconductor portfolio first. The correction was applied to the delivered workbook rather than left standing.

A related discovery from the same test: VTI only begins in 2001, BND in 2007, SMH in mid-2000. Any backtest starting in 2000 with a 60/40 mix silently deletes the dot-com crash and the financial crisis — the two windows where the answer is different. **A comparison tool can lie without a single wrong number in it.** This became a design rule: the window is displayed beside every figure.

---

## 7. Market data — tested, not assumed

| Test | Result |
|---|---|
| 6 tickers, 2021 to date | 1,472 rows, zero missing days, 0.4s |
| 60 tickers, 3 years, one call | 969 rows × 60, no empty columns, 1.4s |
| Intraday 5-minute bars | 78 bars for the session |
| Dividends and splits | Returned; folded into adjusted close |
| Stooq quote CSV | HTTP 404 |
| Stooq history CSV | JavaScript challenge, not CSV |

Documented free-tier limits were read from each provider's own page. The conclusion worth carrying forward: **at a once-daily refresh, rate limits are irrelevant. The licence is the real constraint**, because almost every free tier is personal-use-only.

The recommended source was an unofficial library scraping public endpoints. It has no service guarantee and breaks periodically. Mid-build it rate-limited the host and returned no CORS headers, which forced the architecture: prices must be fetched server-side.

---

## 8. Blockers, stated plainly

Two capabilities the user asked for could not be delivered, and neither is a coding problem.

**8.1 Server-side accounts.** The managed database refused to provision with the message *"the user's WebDev balance is too low"*. This is a **separate wallet** from the MyClaw credits (balance 7,803.9 at 22:38 UTC), which are healthy. Consequence: accounts and portfolios are stored in the browser only. They do not sync between devices, and clearing site data deletes them. The password locks the ledger on one machine; it is not authentication.

**8.2 Live prices.** Trading is possible at any time, but fills use the most recent bundled close — not a live quote. Honest for a review tool, wrong for what was asked. A server-side proxy is the missing component.

**8.3 GitHub.** A git repository was initialised with a first commit, but no remote is connected and no credentials are configured, so nothing has been pushed. **The code currently exists in exactly one place**, which is the fragile part of the whole engagement.

---

## 9. Honest assessment

**What is genuinely good.** The arithmetic is independently verified rather than assumed. The interface makes the product's argument visible in one screen. The example portfolios are labelled as examples with a one-click clean start, rather than passing off back-filled trades as the user's own decisions — the alternative would have been the exact dishonesty the product exists to expose.

**What is unresolved.** The product's core bet — that people return for weeks to watch parallel portfolios diverge — remains untested and unvalidated. No amount of application quality addresses that. The research says the simulator teaches the wrong lesson by default unless the framing actively prevents it.

**What I would do next, in order.**

1. **Connect GitHub and push.** Costs nothing, takes minutes, and removes the single-point-of-failure on the code.
2. **Run the kill test.** Twelve people, four weeks, no engineering. It answers the only question that matters, and it is cheaper than any further building.
3. **Top up the WebDev wallet** if server accounts matter — the storage layer is already shaped like a relational schema, so this is a swap, not a rewrite.
4. **Add a second comparison window** in the interface. The ranking flips between eras, and the app currently shows one window at a time.

The cheapest thing to test next is not a feature. It is whether anyone replies in week four.
