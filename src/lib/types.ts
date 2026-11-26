export type PriceSeries = {
  dates: string[];
  closes: number[];
};

export type PriceBundle = {
  generated: string;
  source: string;
  series: Record<string, PriceSeries>;
};

export type Account = {
  id: string;
  email: string;
  name: string;
};

/**
 * `rebalance` is a mix change: at its fill close, all of the portfolio's money
 * (cash and holdings) is moved into `weights`, and later contributions follow
 * that mix too. A portfolio's first mix is a rebalance as well.
 */
export type TxKind = "deposit" | "buy" | "sell" | "rebalance";

export type Tx = {
  id: string;
  kind: TxKind;
  /**
   * Calendar date the transaction was entered, YYYY-MM-DD (New York time).
   * For orders with `placedAt` this is display-only: the fill day comes from
   * `placedAt`. Legacy rows without `placedAt` (the seeded examples) fill at
   * this date's close.
   */
  date: string;
  /**
   * When the order was placed, as an ISO timestamp. An order fills at the
   * first market close strictly after this moment, never at a close that was
   * already known when it was placed.
   */
  placedAt?: string;
  ticker?: string;
  units?: number;
  /**
   * Legacy only: a fill price stored on the row. Orders with `placedAt`
   * ignore it; their fill price always comes from the close they fill at.
   */
  price?: number;
  amount?: number;
  /**
   * For a sell: the share of the holding to sell, 0–1 (1 = all of it). Trades
   * are stored as a fraction or as dollars, never as shares: prices are
   * dividend-adjusted and old ones get rewritten, which would move a share count.
   */
  fraction?: number;
  note?: string;
  /** For kind = rebalance: ticker -> fraction, summing to 1. */
  weights?: Record<string, number>;
};

export type Portfolio = {
  id: string;
  name: string;
  /** One line on what this path represents. */
  thesis: string;
  startDate: string;
  initial: number;
  /** Deposited on the first trading day of each month after the start. */
  monthly?: number;
  /** Deposited on the first trading day of each week after the start. */
  weekly?: number;
  tx: Tx[];
  /**
   * Live purchase prices for a live portfolio created during market hours, by
   * ticker. They apply to a mix that fills on the day they were taken; other
   * tickers (mutual funds) buy at that day's close. `ratio` = price / that
   * day's close, frozen once the close arrives (so later dividend
   * re-adjustments of old closes don't move it).
   */
  startQuotes?: Record<string, StartQuote>;
  /**
   * Where contributions go before any rebalance has filled, as fractions
   * summing to 1. After a rebalance fills, its mix takes over.
   *
   * Without this, a contribution lands in cash and sits there — which turns a
   * "same dollars" comparison into "invest once, then hoard cash". The weights
   * are what make the monthly deposit actually buy the strategy.
   */
  weights?: Record<string, number>;
  /**
   * True for the seeded demonstration portfolios.
   *
   * The distinction matters: an example portfolio shows real market history but
   * NOT your decisions. Presenting backfilled trades as your own record would be
   * precisely the dishonesty this tool is supposed to expose, so the UI labels
   * them and offers a clean start.
   */
  example?: boolean;
};


export type Holding = {
  ticker: string;
  units: number;
  price: number;
  value: number;
  weight: number;
  cost: number;
};

export type StartQuote = { price: number; at: string; ratio?: number };

export type Fill = {
  /** Trading day whose close the order filled at. */
  date: string;
  price: number;
  units: number;
  amount: number;
  /** For a rebalance: tickers not trading yet, whose share was set aside as cash. */
  waited?: string[];
  /** For a rebalance: tickers bought at a live price during the day, not the close. */
  live?: string[];
  /** For a sale: gain (or loss, negative) on the shares sold, split by holding period. */
  gain?: { shortTerm: number; longTerm: number };
};

export type PendingOrder = {
  txId: string;
  kind: "buy" | "sell" | "rebalance";
  /** Absent for a rebalance. */
  ticker?: string;
  /** Dollars for buys and sells; 0 for a rebalance (it moves everything). */
  amount: number;
  /** For a rebalance: the new mix. */
  weights?: Record<string, number>;
  placedAt: string;
};

export type PortfolioState = {
  id: string;
  name: string;
  thesis: string;
  dates: string[];
  values: number[];
  /** Cash put in up to and including each day (start amount plus deposits), lined up with `values`. */
  investedSeries: number[];
  cash: number;
  invested: number;
  value: number;
  profit: number;
  returnOnInvested: number;
  maxDrawdown: number;
  holdings: Holding[];
  /**
   * Drawdown from peak, per day, measured on the time-weighted index (so a
   * deposit never hides a fall and a withdrawal never creates one).
   */
  drawdownSeries: number[];
  /** Growth of $1 with every deposit stripped out: the time-weighted index. */
  twrIndex: number[];
  /** Total time-weighted return over the window. */
  twr: number;
  /** Annualised volatility of daily time-weighted returns. */
  volatility: number;
  /** Cash minus what pending buy orders have reserved. */
  availableCash: number;
  /** Orders placed but not yet filled, because their close has not happened (or is not in the data yet). */
  pending: PendingOrder[];
  /** How each filled order filled, by transaction id. */
  fills: Record<string, Fill>;
  /** The mix currently in force (the last filled rebalance, else the portfolio's weights). */
  currentWeights?: Record<string, number>;
  /** Cash still set aside for stocks that haven't started trading yet, by ticker. */
  waiting: Record<string, number>;
  /** Stocks whose set-aside cash bought in later, and the day they did (their first trading day). */
  boughtIn: Record<string, string>;
  /** Biggest bump: the largest rise from a low to a later high (0.4 = +40%), and those two days. */
  maxRunUp: number;
  maxRunUpDates?: [string, string];
  /** The high and the later low that make the biggest drop. */
  maxDrawdownDates?: [string, string];
  /** Each holding's value at each close (aligned with `dates`; 0 when not held). */
  byTicker: Record<string, number[]>;
  /** Cash, including cash set aside for stocks not trading yet, at each close. */
  cashSeries: number[];
  /** Purchases still held. */
  lots: Lot[];
  /** Gains and losses from sales so far. */
  realized: RealizedGain[];
  taxes: TaxSummary;
  /** What happened, in order (for the portfolio's timeline). */
  events: TimelineEvent[];
  /** Orders that reached their close but could not be filled, by transaction id. */
  /** Orders that couldn't happen, with a sentence saying why. */
  rejections: Record<string, { date: string; reason: string }>;
  /** Cash that can be spent (not set aside for a stock waiting to trade), at each close. */
  freeCashSeries: number[];
  lastDate: string;
  /** Trades that could not be filled (insufficient cash, no holding). Surfaced in the UI. */
  rejected: string[];
};

/** One purchase still held: for cost basis and whether its gain would be short- or long-term. */
export type Lot = { ticker: string; date: string; units: number; cost: number };

export type RealizedGain = {
  ticker: string;
  bought: string;
  sold: string;
  proceeds: number;
  cost: number;
  gain: number;
  /** Held more than a year. */
  longTerm: boolean;
};

export type TaxSummary = {
  /** Gains (or losses) if everything were sold at the last close, by holding period. */
  unrealizedShort: number;
  unrealizedLong: number;
  /** Tax those would owe, at 24% short-term / 15% long-term after netting. */
  potentialTax: number;
  /** Gains (or losses) from sales so far. */
  realizedShort: number;
  realizedLong: number;
  /** Tax on sales so far: each tax year's gains and losses netted on their own, then added up. */
  actualTax: number;
  /** Sales by the year they happened in, oldest first. */
  byYear: { year: number; realizedShort: number; realizedLong: number; tax: number }[];
};

export type TimelineEvent = {
  date: string;
  kind: "start" | "mix" | "waiting" | "bought_in" | "buy" | "sell";
  weights?: Record<string, number>;
  tickers?: string[];
  amount?: number;
  /** For a start or mix change bought partly at live prices: the price paid per ticker, and when. */
  live?: { prices: Record<string, number>; at: string };
  /** For a buy or sell: the trade it came from, the price per share and the shares. */
  txId?: string;
  price?: number;
  units?: number;
  /** For a sell: share of the holding sold (1 = all of it), if sold that way. */
  fraction?: number;
  /** For a sell: gain or loss, by holding period. */
  gain?: { shortTerm: number; longTerm: number };
};
