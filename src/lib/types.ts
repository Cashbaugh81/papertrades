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

export type Fill = {
  /** Trading day whose close the order filled at. */
  date: string;
  price: number;
  units: number;
  amount: number;
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
  /** Orders that reached their close but could not be filled, by transaction id. */
  rejections: Record<string, { date: string; reason: string }>;
  lastDate: string;
  /** Trades that could not be filled (insufficient cash, no holding). Surfaced in the UI. */
  rejected: string[];
};
