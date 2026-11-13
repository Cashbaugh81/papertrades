/**
 * Market clock helpers. US equities close at 16:00 New York time; the offset
 * from UTC changes with daylight saving, so it is worked out per day rather
 * than hard-coded.
 *
 * Known simplification: half-day sessions (day after Thanksgiving, Christmas
 * Eve) close at 13:00, but are treated as 16:00 here. An order placed between
 * 13:00 and 16:00 on one of those days fills at that day's close, a few hours
 * after it was set. Everything else is strictly after placement.
 */

const NY = "America/New_York";

const hourFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NY,
  hour: "numeric",
  hourCycle: "h23",
});

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: NY,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The UTC instant of the 16:00 New York close on trading day `day` (YYYY-MM-DD). */
export function closeInstant(day: string): number {
  // 16:00 New York is 20:00 UTC in summer (EDT) and 21:00 UTC in winter (EST).
  for (const utcHour of [20, 21]) {
    const t = Date.parse(`${day}T${String(utcHour).padStart(2, "0")}:00:00Z`);
    if (Number(hourFmt.format(t)) === 16) return t;
  }
  // Unreachable for New York, but never fill early if it somehow happens.
  return Date.parse(`${day}T21:00:00Z`);
}

/** Calendar date in New York for an instant, as YYYY-MM-DD. */
export function nyDate(t: number | Date = Date.now()): string {
  return dateFmt.format(typeof t === "number" ? t : t.getTime());
}

/** True if the close of `day` happened strictly after `placedAt`. */
export function closesAfter(day: string, placedAt: string): boolean {
  return closeInstant(day) > Date.parse(placedAt);
}
