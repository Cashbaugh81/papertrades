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
  /** Not a real password hash: this build has no server. See README note in UI. */
  secret: string;
  createdAt: string;
};

export type TxKind = "deposit" | "buy" | "sell";

export type Tx = {
  id: string;
  kind: TxKind;
  /** Trading day the transaction settles on, YYYY-MM-DD. */
  date: string;
  ticker?: string;
  units?: number;
  /** Fill price per unit at entry. Deposits leave this undefined. */
  price?: number;
  amount?: number;
  note?: string;
};

export type Portfolio = {
  id: string;
  name: string;
  /** One line on what this path represents. */
  thesis: string;
  startDate: string;
  initial: number;
  monthly: number;
  tx: Tx[];
  /**
   * Where each monthly contribution goes, as fractions summing to 1.
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

export type AccountData = {
  account: Account;
  portfolios: Portfolio[];
};

export type Holding = {
  ticker: string;
  units: number;
  price: number;
  value: number;
  weight: number;
  cost: number;
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
  /** Daily returns, used for volatility. */
  drawdownSeries: number[];
  volatility: number;
  lastDate: string;
  /** Trades that could not be filled (insufficient cash, no holding). Surfaced in the UI. */
  rejected: string[];
};
