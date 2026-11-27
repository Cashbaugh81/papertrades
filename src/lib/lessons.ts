// Beginner lessons for the dashboard's lesson cards: one idea per card,
// a short lesson and a one-line example. US tax rules where taxes come up.

export type LessonCategory =
  | "Market basics"
  | "What you can buy"
  | "Strategies"
  | "Risk & mindset"
  | "Taxes, accounts & orders";

export type Lesson = { category: LessonCategory; title: string; body: string; example: string };

/** Each topic's colour, taken from the chart palette. */
export const CATEGORY_COLORS: Record<LessonCategory, string> = {
  "Market basics": "#1D4ED8",
  "What you can buy": "#0891B2",
  "Strategies": "#008300",
  "Risk & mindset": "#C8102E",
  "Taxes, accounts & orders": "#9333EA",
};

export const LESSONS: Lesson[] = [
  {
    category: "Market basics",
    title: "What a stock is",
    body: "A share of stock is a small slice of ownership in a company. If the company grows and earns more, your slice can become worth more. If it struggles, your slice can lose value.",
    example: "Own 1 share of a company with 1 billion shares and you own one-billionth of it.",
  },
  {
    category: "Market basics",
    title: "Why prices move",
    body: "Stock prices move on supply and demand. When more people want to buy than sell, the price rises; when more want to sell, it falls. News, earnings reports and the market's mood shift that balance every day.",
    example: "A company beats its profit forecast, buyers rush in, and the price jumps 6% in a day.",
  },
  {
    category: "Market basics",
    title: "Tickers",
    body: "Every listed investment has a short code called a ticker. You use it to look up prices and to place trades.",
    example: "AAPL is Apple. VTI is Vanguard's Total Stock Market ETF.",
  },
  {
    category: "Market basics",
    title: "Market hours and the close",
    body: "The main US exchanges, the NYSE and Nasdaq, trade from 9:30 a.m. to 4:00 p.m. Eastern on weekdays. The last price of the day is the closing price, the number most charts and reports use.",
    example: "Place an order on Saturday and it waits until the market opens Monday.",
  },
  {
    category: "Market basics",
    title: "Bull vs. bear markets",
    body: "A bull market is a long stretch of rising prices. A bear market is a drop of 20% or more from a recent high. Both are normal parts of investing, and both eventually end.",
    example: "If an index peaks at 5,000 and falls to 4,000, that 20% drop is a bear market.",
  },
  {
    category: "Market basics",
    title: "Market cap",
    body: "Market capitalization is share price × number of shares. It tells you a company's size far better than its share price alone.",
    example: "A $20 stock with 10 billion shares ($200B) is bigger than a $500 stock with 100 million shares ($50B).",
  },
  {
    category: "Market basics",
    title: "Indexes",
    body: "An index tracks a group of stocks to measure part of the market. The S&P 500 follows about 500 large US companies; the Dow follows 30. You can't buy an index itself, but you can buy a fund that copies one.",
    example: "\"The market was up 1% today\" usually means the S&P 500 rose 1%.",
  },
  {
    category: "Market basics",
    title: "Dividends",
    body: "Some companies pay part of their profits to shareholders in cash, usually every quarter. Dividend yield is the yearly dividend divided by the share price.",
    example: "A $50 stock paying $2 a year has a 4% dividend yield.",
  },
  {
    category: "Market basics",
    title: "Total return",
    body: "Your real return is the price change plus any dividends you received. Looking at price alone undercounts what you earned.",
    example: "A stock goes from $100 to $105 and pays $3 in dividends: that's an 8% total return, not 5%.",
  },
  {
    category: "Market basics",
    title: "Stock splits",
    body: "A split gives you more shares at a lower price each, but the total value of what you own doesn't change. It's like cutting a pizza into more slices.",
    example: "In a 2-for-1 split, 10 shares at $100 become 20 shares at $50. Still $1,000.",
  },
  {
    category: "Market basics",
    title: "Inflation",
    body: "Prices for everyday things rise over time, so cash sitting still slowly loses buying power. Investing aims to grow your money faster than inflation.",
    example: "At 3% inflation, $100 buys only about $74 worth of today's goods 10 years from now.",
  },
  {
    category: "What you can buy",
    title: "Bonds",
    body: "A bond is a loan you make to a government or company. They pay you interest along the way and return your money on a set date, called maturity. Bonds usually swing less than stocks and earn less over time.",
    example: "Buy a $1,000 bond paying 4% and you get $40 a year, then your $1,000 back at maturity.",
  },
  {
    category: "What you can buy",
    title: "Bonds and interest rates",
    body: "When interest rates rise, existing bonds lose value, because new bonds pay more. When rates fall, existing bonds gain value. Longer-term bonds swing the most.",
    example: "Your bond pays 3%. New ones pay 5%. Buyers will only take yours at a discount.",
  },
  {
    category: "What you can buy",
    title: "Mutual funds",
    body: "A mutual fund pools money from many investors to buy a basket of stocks, bonds or both. You get instant variety in one purchase. Mutual funds trade once a day, at the closing price.",
    example: "Put $500 into a fund and you own a small piece of every holding in it.",
  },
  {
    category: "What you can buy",
    title: "ETFs",
    body: "An exchange-traded fund is also a basket of investments, but it trades all day on an exchange, like a stock. Many ETFs track an index and charge very low fees.",
    example: "Buying one share of an S&P 500 ETF gives you a slice of all ~500 companies.",
  },
  {
    category: "What you can buy",
    title: "Index funds",
    body: "An index fund copies an index instead of paying managers to pick stocks. That keeps fees low, and over long periods most actively managed funds trail their index after fees.",
    example: "A total-market index fund simply owns nearly every US public company in proportion to its size.",
  },
  {
    category: "What you can buy",
    title: "Expense ratios",
    body: "The expense ratio is the yearly fee a fund charges, as a percentage of your money. It's taken quietly from the fund's value, so it's easy to overlook, and small differences add up over decades.",
    example: "On $10,000, a 0.03% fee costs $3 a year. A 1% fee costs $100.",
  },
  {
    category: "What you can buy",
    title: "Cash and money market funds",
    body: "Money market funds hold very short-term, low-risk debt and pay interest. They're a good home for money you'll need soon, but over long periods they usually trail stocks and can barely keep up with inflation.",
    example: "Saving for a car you'll buy next year? A money market fund fits better than stocks.",
  },
  {
    category: "What you can buy",
    title: "Growth vs. value stocks",
    body: "Growth stocks belong to companies expected to grow fast, and they're often priced high compared with today's profits. Value stocks look cheap compared with their profits. Each style has had long stretches of beating the other.",
    example: "A young software company is a typical growth stock; a steady bank is a typical value stock.",
  },
  {
    category: "What you can buy",
    title: "Large, mid and small caps",
    body: "Companies are grouped by size: large caps, mid caps and small caps. Large companies tend to be steadier. Small companies can grow faster but swing harder in both directions.",
    example: "A small-cap fund might rise 30% in a great year and fall 30% in a bad one.",
  },
  {
    category: "What you can buy",
    title: "International stocks",
    body: "US companies are a big part of the world's stock market, but not all of it. Owning stocks from other countries spreads your bets across different economies and currencies.",
    example: "A total world stock fund holds companies from dozens of countries in one purchase.",
  },
  {
    category: "Strategies",
    title: "Buy and hold",
    body: "Buy diversified investments and keep them for years, riding out the short-term swings. It keeps trading costs and taxes low and avoids the trap of guessing when to get in and out.",
    example: "Buy an index fund at 25 and keep adding to it until retirement.",
  },
  {
    category: "Strategies",
    title: "Dollar-cost averaging",
    body: "Invest a fixed amount on a regular schedule, no matter what the market is doing. You automatically buy more shares when prices are low and fewer when they're high.",
    example: "$50 every week buys 5 shares at $10, but 10 shares when the price dips to $5.",
  },
  {
    category: "Strategies",
    title: "Lump sum vs. spreading it out",
    body: "With a pile of cash to invest, putting it all in at once has historically come out ahead about two-thirds of the time, because markets rise more often than they fall. Spreading it out feels safer and limits regret if prices drop right after.",
    example: "$12,000 today vs. $1,000 a month for a year: either is reasonable; just pick a plan and stick to it.",
  },
  {
    category: "Strategies",
    title: "Diversification",
    body: "Don't put all your eggs in one basket. Owning many companies across different industries means one company's failure can't sink your whole portfolio.",
    example: "If one of 500 holdings goes to zero, you lose 0.2%, not everything.",
  },
  {
    category: "Strategies",
    title: "Asset allocation",
    body: "Asset allocation is how you split your money between stocks, bonds and cash. That mix drives most of your portfolio's ups and downs, more than which individual funds you pick.",
    example: "80% stocks / 20% bonds will swing more, and usually grow more, than 50/50.",
  },
  {
    category: "Strategies",
    title: "Rebalancing",
    body: "Over time, your winners grow to take up more of your portfolio than you planned. Rebalancing means trimming what grew and adding to what lagged to get back to your target mix.",
    example: "Your 70/30 mix drifts to 80/20 after a great year, so you shift 10% back into bonds.",
  },
  {
    category: "Strategies",
    title: "Time in the market",
    body: "Missing just a handful of the market's best days can cut long-term returns sharply, and the best days often come right after the worst ones. Staying invested usually beats jumping in and out.",
    example: "Selling during a crash and waiting for \"things to calm down\" often means missing the rebound.",
  },
  {
    category: "Strategies",
    title: "Compounding",
    body: "Your gains earn their own gains. The longer your money stays invested, the faster it grows, because each year builds on a bigger base.",
    example: "$10,000 growing 7% a year becomes about $19,700 in 10 years, and about $76,100 in 30.",
  },
  {
    category: "Strategies",
    title: "The Rule of 72",
    body: "Divide 72 by your yearly return to estimate how many years it takes your money to double. It's a quick mental shortcut, not an exact figure.",
    example: "At 8% a year, money doubles in about 9 years. At 4%, about 18.",
  },
  {
    category: "Strategies",
    title: "Active vs. passive",
    body: "Active investors try to beat the market by picking stocks or timing trades. Passive investors try to match the market with index funds. Passive is cheaper and simpler; active has to beat the market by more than its extra costs just to come out even.",
    example: "A fund charging 1% more than an index fund must outperform it by 1% a year just to tie.",
  },
  {
    category: "Risk & mindset",
    title: "Risk and return go together",
    body: "Investments that can earn more usually swing more. There's no high long-term return without the chance of painful drops along the way.",
    example: "Stocks have beaten cash over long periods, but they've also fallen by a third or more in a single year.",
  },
  {
    category: "Risk & mindset",
    title: "Volatility",
    body: "Volatility is how much and how fast a price moves. A volatile stock can drop 10% in a day. A swing isn't a permanent loss, unless you sell at the bottom.",
    example: "Your fund drops 8% in a month, then recovers in three. You only lost money if you sold.",
  },
  {
    category: "Risk & mindset",
    title: "Drawdowns",
    body: "A drawdown is the fall from a peak to a low point. Big ones happen every so often. Knowing that in advance makes them easier to sit through.",
    example: "The S&P 500 fell about 34% in early 2020 and about 57% from 2007 to 2009.",
  },
  {
    category: "Risk & mindset",
    title: "The math of losses",
    body: "Losses and gains aren't symmetrical. A 50% loss needs a 100% gain just to get back to where you started, which is why avoiding huge losses matters.",
    example: "$100 drops to $50. Now it has to double to reach $100 again.",
  },
  {
    category: "Risk & mindset",
    title: "Match money to time",
    body: "Money you'll need within a few years shouldn't be in stocks, because they can fall a lot in any single year. The longer you can wait, the more time you have to recover from drops.",
    example: "House down payment in 2 years? Keep it in cash. Retirement in 30 years? Stocks make sense.",
  },
  {
    category: "Risk & mindset",
    title: "Emergency fund first",
    body: "Before investing, set aside a few months of expenses in cash. Then a surprise bill won't force you to sell your investments at a bad time.",
    example: "Car repair for $1,500 during a market dip? Pay it from savings, not by selling stocks at a loss.",
  },
  {
    category: "Risk & mindset",
    title: "FOMO",
    body: "Fear of missing out pushes people to buy after a big run-up, often near the top. If you're buying mostly because everyone is talking about it, slow down.",
    example: "A stock triples in a month and is all over social media. That's when risk is often highest.",
  },
  {
    category: "Risk & mindset",
    title: "Panic selling",
    body: "Selling during a crash locks in your loss, and you may miss the rebound. Decide on your plan before the drop so fear doesn't make the decision for you.",
    example: "Write down now: \"If the market falls 20%, I will keep investing as usual.\"",
  },
  {
    category: "Risk & mindset",
    title: "Don't chase last year's winner",
    body: "Last year's top-performing fund is rarely next year's. Strong recent returns often reflect luck or a hot sector that later cools off.",
    example: "A fund up 60% last year is in the news, but that says little about the next 12 months.",
  },
  {
    category: "Risk & mindset",
    title: "Concentration risk",
    body: "Putting a large share of your money in one stock, even your employer's, ties your future to one company. Many investors keep any single stock to a small slice of their portfolio.",
    example: "If one stock is half your portfolio, a 40% drop in it costs you 20% overall.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "Short-term vs. long-term gains",
    body: "In the US, profit on an investment you held one year or less is a short-term gain, taxed like your paycheck. Hold it more than a year and it's a long-term gain, taxed at lower federal rates (0%, 15% or 20%).",
    example: "Sell after 11 months and you may pay your regular tax rate. Wait one more month and it could be 15%.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "Realized vs. unrealized gains",
    body: "A gain is unrealized, a paper gain, until you sell. In a regular taxable account, you owe tax only when you sell for a profit.",
    example: "Your shares are up $2,000. No tax is due until you actually sell them.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "Tax-loss harvesting",
    body: "Selling an investment at a loss can offset your gains, plus up to $3,000 of regular income a year. But buy the same investment back within 30 days and the wash-sale rule cancels the loss.",
    example: "Sell a fund at a $1,000 loss to cancel out $1,000 of gains elsewhere.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "401(k)s and IRAs",
    body: "These retirement accounts let your investments grow without yearly taxes. Traditional accounts give you a tax break now and tax withdrawals later. Roth accounts tax you now, and qualified withdrawals are tax-free.",
    example: "Expect a higher tax rate in retirement? A Roth may be the better fit.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "The employer match",
    body: "If your employer matches 401(k) contributions, putting in enough to get the full match is like an instant return on that money. Few investments can beat it.",
    example: "Your employer adds 50¢ for every $1 you put in, up to 6% of pay. That's a 50% return on day one.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "Market vs. limit orders",
    body: "A market order buys or sells right away at the best price available. A limit order sets the most you'll pay, or the least you'll accept, and only fills at that price or better.",
    example: "Limit buy at $40: if the stock is $42, your order waits until it drops to $40.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "Stop-loss orders",
    body: "A stop-loss order becomes a market order if the price falls to a level you set, to help limit losses. In a fast drop, it can sell well below your stop price.",
    example: "Stop at $90 on a $100 stock. Bad news opens it at $80, and you sell near $80, not $90.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "The P/E ratio",
    body: "The price-to-earnings ratio is the share price divided by a year's profit per share. It shows how much you're paying for each dollar of profit. A high P/E means investors expect growth, or the stock is pricey.",
    example: "A $100 stock earning $5 per share has a P/E of 20.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "Practice with paper trading",
    body: "Paper trading lets you try strategies and feel real market swings with pretend money, at no risk. Real money feels different, so when you go live, start small.",
    example: "Compare a 100% stock portfolio with a 60/40 mix side by side and see how each handles a crash.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "Selling part of a holding",
    body: "Your gain on a sale is what you sell for minus what you paid for those exact shares, your cost basis. If you bought at different times, most brokers count the oldest shares as sold first, so each sale can mix older and newer purchases.",
    example: "You bought 10 shares at $50, then 10 at $80. Sell 10 at $90 and the gain is $400 (on the $50 shares), not $100.",
  },
  {
    category: "Taxes, accounts & orders",
    title: "The cost of switching",
    body: "Selling one investment to buy another is two decisions, and in a taxable account the sale can cost you tax on any gain first. Less money then goes into the new pick, so it has to do better just to break even.",
    example: "Sell $10,000 of a stock with a $3,000 short-term gain: at a 24% rate, $720 goes to tax and $9,280 is left to reinvest.",
  },
];
