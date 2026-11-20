// Ticker search helpers, shared by the `search` edge function (bundled to
// supabase/functions/_shared/search.js by `npm run build:engine`) and tests.

export type SearchHit = { ticker: string; name: string; assetType: string };

const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;
const KINDS = new Set(["Stock", "ETF", "Mutual Fund"]);
export const MAX_HITS = 8;

/**
 * The query as cached and sent: lower-case, single spaces, only characters a
 * name or ticker uses. Undefined when too short or too long to search.
 */
export function normaliseQuery(raw: string): string | undefined {
  const q = raw
    .toLowerCase()
    .replace(/[^a-z0-9 .&'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return q.length >= 2 && q.length <= 40 ? q : undefined;
}

/** Tiingo's search response → active stocks, ETFs and mutual funds we can price, best match first. */
export function parseSearch(json: unknown, query: string): SearchHit[] {
  if (!Array.isArray(json)) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const ticker = typeof r.ticker === "string" ? r.ticker.trim().toUpperCase() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const assetType = typeof r.assetType === "string" ? r.assetType : "";
    if (!TICKER_RE.test(ticker) || !name || seen.has(ticker)) continue;
    if (r.isActive === false || !KINDS.has(assetType)) continue;
    seen.add(ticker);
    hits.push({ ticker, name, assetType });
  }
  return rank(hits, query).slice(0, MAX_HITS);
}

/** Exact ticker first, then tickers starting with the query, then names starting with it, then the rest. */
export function rank(hits: SearchHit[], query: string): SearchHit[] {
  const q = query.toUpperCase();
  const score = (h: SearchHit) =>
    h.ticker === q ? 0 : h.ticker.startsWith(q) ? 1 : h.name.toUpperCase().startsWith(q) ? 2 : 3;
  return hits
    .map((h, i) => ({ h, i, s: score(h) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.h);
}

// ---- names people use that the listing doesn't -------------------------------------

/**
 * Brands, old names and nicknames that Tiingo's search doesn't connect to the
 * listed company ("google" finds Google-themed ETFs, not Alphabet; "space x"
 * finds nothing because SpaceX lists as Space Exploration Technologies). Keys
 * are lower-case letters and digits only (see collapse()). These hits go first.
 */
export const ALIASES: Record<string, SearchHit[]> = (() => {
  const alphabet: SearchHit[] = [
    { ticker: "GOOGL", name: "Alphabet Inc (Google), Class A", assetType: "Stock" },
    { ticker: "GOOG", name: "Alphabet Inc (Google), Class C", assetType: "Stock" },
  ];
  const meta: SearchHit[] = [{ ticker: "META", name: "Meta Platforms Inc (Facebook)", assetType: "Stock" }];
  const spacex: SearchHit[] = [{ ticker: "SPCX", name: "Space Exploration Technologies Corp (SpaceX)", assetType: "Stock" }];
  const berkshire: SearchHit[] = [
    { ticker: "BRK-B", name: "Berkshire Hathaway Inc, Class B", assetType: "Stock" },
    { ticker: "BRK-A", name: "Berkshire Hathaway Inc, Class A", assetType: "Stock" },
  ];
  const sp500: SearchHit[] = [
    { ticker: "VOO", name: "Vanguard S&P 500 ETF", assetType: "ETF" },
    { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", assetType: "ETF" },
    { ticker: "IVV", name: "iShares Core S&P 500 ETF", assetType: "ETF" },
  ];
  const bitcoin: SearchHit[] = [
    { ticker: "IBIT", name: "iShares Bitcoin Trust ETF", assetType: "ETF" },
    { ticker: "FBTC", name: "Fidelity Wise Origin Bitcoin Fund", assetType: "ETF" },
  ];
  return {
    google: alphabet,
    youtube: alphabet,
    alphabet,
    facebook: meta,
    instagram: meta,
    whatsapp: meta,
    spacex: spacex,
    spaceexploration: spacex,
    starlink: spacex,
    berkshire,
    berkshirehathaway: berkshire,
    sp500,
    snp500: sp500,
    standardandpoors: sp500,
    nasdaq: [{ ticker: "QQQ", name: "Invesco QQQ Trust (Nasdaq-100)", assetType: "ETF" }],
    nasdaq100: [{ ticker: "QQQ", name: "Invesco QQQ Trust (Nasdaq-100)", assetType: "ETF" }],
    dow: [{ ticker: "DIA", name: "SPDR Dow Jones Industrial Average ETF", assetType: "ETF" }],
    dowjones: [{ ticker: "DIA", name: "SPDR Dow Jones Industrial Average ETF", assetType: "ETF" }],
    totalmarket: [{ ticker: "VTI", name: "Vanguard Total Stock Market ETF", assetType: "ETF" }],
    wholemarket: [{ ticker: "VTI", name: "Vanguard Total Stock Market ETF", assetType: "ETF" }],
    bitcoin,
    btc: bitcoin,
    ethereum: [{ ticker: "ETHA", name: "iShares Ethereum Trust ETF", assetType: "ETF" }],
    gold: [{ ticker: "GLD", name: "SPDR Gold Shares", assetType: "ETF" }],
    coke: [{ ticker: "KO", name: "Coca-Cola Co", assetType: "Stock" }],
    cocacola: [{ ticker: "KO", name: "Coca-Cola Co", assetType: "Stock" }],
    mcdonalds: [{ ticker: "MCD", name: "McDonald's Corp", assetType: "Stock" }],
    dominos: [{ ticker: "DPZ", name: "Domino's Pizza Inc", assetType: "Stock" }],
    jnj: [{ ticker: "JNJ", name: "Johnson & Johnson", assetType: "Stock" }],
    johnsonandjohnson: [{ ticker: "JNJ", name: "Johnson & Johnson", assetType: "Stock" }],
    pg: [{ ticker: "PG", name: "Procter & Gamble Co", assetType: "Stock" }],
    procterandgamble: [{ ticker: "PG", name: "Procter & Gamble Co", assetType: "Stock" }],
    tsmc: [{ ticker: "TSM", name: "Taiwan Semiconductor Manufacturing Co (TSMC)", assetType: "Stock" }],
    chipotle: [{ ticker: "CMG", name: "Chipotle Mexican Grill Inc", assetType: "Stock" }],
  };
})();

/** Letters and digits only, lower case: "Space X" → "spacex", "S&P 500" → "sp500", "P&G" → "pg". */
export function collapse(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Hits for names people use that the listing doesn't (see ALIASES). Matches the
 * whole query, or its start for longer names ("google stock", "spacex shares").
 */
export function aliasHits(query: string): SearchHit[] {
  const c = collapse(query);
  if (ALIASES[c]) return ALIASES[c];
  const words = query.toLowerCase().split(/\s+/);
  for (let n = words.length - 1; n >= 1; n--) {
    const head = collapse(words.slice(0, n).join(" "));
    if (head.length >= 4 && ALIASES[head]) return ALIASES[head];
  }
  return [];
}

/** Alias hits first, then the rest, without repeats, at most MAX_HITS. */
export function mergeHits(first: SearchHit[], rest: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of [...first, ...rest]) {
    if (seen.has(h.ticker)) continue;
    seen.add(h.ticker);
    out.push(h);
  }
  return out.slice(0, MAX_HITS);
}
