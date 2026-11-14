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
