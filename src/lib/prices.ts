import type { PriceBundle, PriceSeries } from "@/lib/types";

let bundlePromise: Promise<PriceBundle> | null = null;

export function loadPrices(): Promise<PriceBundle> {
  if (!bundlePromise) {
    bundlePromise = fetch(`${import.meta.env.BASE_URL}data/prices.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Price data failed to load (${r.status})`);
        return r.json() as Promise<PriceBundle>;
      })
      .catch((err) => {
        bundlePromise = null;
        throw err;
      });
  }
  return bundlePromise;
}

/** ticker -> date -> close, with the trading calendar derived once. */
export type PriceIndex = {
  calendar: string[];
  close: (ticker: string, date: string) => number | undefined;
  tickers: string[];
  lastDate: string;
  generated: string;
  source: string;
};

export function buildIndex(bundle: PriceBundle): PriceIndex {
  const lookup = new Map<string, Map<string, number>>();
  const allDates = new Set<string>();

  for (const [ticker, series] of Object.entries(bundle.series)) {
    const m = new Map<string, number>();
    const s: PriceSeries = series;
    for (let i = 0; i < s.dates.length; i++) {
      m.set(s.dates[i], s.closes[i]);
      allDates.add(s.dates[i]);
    }
    lookup.set(ticker, m);
  }

  const calendar = [...allDates].sort();

  return {
    calendar,
    tickers: Object.keys(bundle.series).sort(),
    lastDate: calendar[calendar.length - 1] ?? "",
    generated: bundle.generated,
    source: bundle.source,
    close: (ticker: string, date: string) => lookup.get(ticker)?.get(date),
  };
}

/** Last available close on or before `date`. */
export function closeOn(index: PriceIndex, ticker: string, date: string): number | undefined {
  const m = index.calendar;
  let lo = 0;
  let hi = m.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (m[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  for (let i = found; i >= 0; i--) {
    const px = index.close(ticker, m[i]);
    if (px !== undefined) return px;
  }
  return undefined;
}

/** First trading day on or after `date`. */
export function tradingDayOnOrAfter(index: PriceIndex, date: string): string | undefined {
  return index.calendar.find((d) => d >= date);
}

export function monthStarts(calendar: string[], from: string, to: string): string[] {
  const out: string[] = [];
  let lastKey = "";
  for (const d of calendar) {
    if (d < from || d > to) continue;
    const key = d.slice(0, 7);
    if (key !== lastKey) {
      out.push(d);
      lastKey = key;
    }
  }
  return out;
}
