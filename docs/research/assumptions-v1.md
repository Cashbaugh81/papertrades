# Parallel Portfolio Platform — Assumption List v1
Date: 2026-11-12
Status: first pass, nothing tested yet

## Idea as stated
A consumer platform where a beginner enters (a) cash on hand and (b) monthly contribution, then runs
several portfolios side by side against the *same* dollars — e.g. simple ETF mix vs chip-concentrated
single stocks vs healthcare basket — and watches them diverge. Lessons wrapped around it. Stated purpose:
"show them what their urges look like in the market."

## Assumptions, ranked by probability of being false

**A1 (most likely false). Beginners will return to a simulator weekly for 8+ weeks without a cash incentive.**
Why it's load-bearing: the product's entire value appears only after multi-week divergence. Before week 6
there is nothing to see. No broker P&L, no order flow, no prize.
Falsified if: 4-week cohort return rate < 40%.
Cheapest test: concierge, see kill-test-v1.md.

**A2. Being shown your own bad instincts is a *retaining* experience, not a quitting one.**
Why it's load-bearing: the emotional payoff of the core loop is "you would have done worse than the boring
portfolio." That is a mild reprimand delivered by software, weekly.
Falsified if: users who see a negative delta in week 2-3 churn at a materially higher rate than users who
see a positive delta.

**A3. People will pay a subscription for diagnosis rather than paying a broker for execution.**
Why it's load-bearing: every incumbent in the space is free-at-point-of-use because the broker monetizes
the account. A pure subscription has to beat $0 with a strictly worse feature set (no real trading).
Falsified if: < 15% of engaged 4-week users will prepay $10/mo.

**A4. The "same dollars, multiple portfolios" mechanic is a product, not a feature.**
Counter-evidence already in hand: it is one accounting view. TradingView allows several paper accounts;
StockTrak/HowTheMarketWorks allow multiple concurrent contests with custom starting cash. Any competitor
can ship parallel shadow ledgers in a sprint.
Falsified if: no user describes this as the reason they came back in week 4.

**A5. The audience can be found at a price that works.**
Alinea needed $22.5M of user-acquisition financing in Feb 2026 to keep scaling a $120/yr product
(alinea-invest.com press release). Inference: paid CAC in this category is large relative to subscription ARPU.

**A6. "Here is your cash and monthly contribution" stays on the education side of the advice line.**
Personalised-amount + recommended-portfolio-comparison edges toward personal recommendation in several
jurisdictions. Needs a lawyer, not a guess.

**A7. The competition question is answerable by feature comparison.**
Doubtful: the real moat in this category, per every data point available, is distribution (TikTok) and
retention, not features.
