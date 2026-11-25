import { describe, expect, it } from "vitest";
import { availableRanges, rangeStart, windowState } from "@/lib/ranges";
import type { PortfolioState } from "@/lib/types";

describe("rangeStart", () => {
  it("counts back from the last day", () => {
    expect(rangeStart("1W", "2026-11-25")).toBe("2026-11-18");
    expect(rangeStart("1M", "2026-11-25")).toBe("2026-10-25");
    expect(rangeStart("3M", "2026-11-25")).toBe("2026-08-25");
    expect(rangeStart("YTD", "2026-11-25")).toBe("2026-01-01");
    expect(rangeStart("1Y", "2026-11-25")).toBe("2025-11-25");
    expect(rangeStart("10Y", "2026-11-25")).toBe("2016-11-25");
    expect(rangeStart("All", "2026-11-25")).toBeUndefined();
  });
  it("lands on the month's last day when the day doesn't exist", () => {
    expect(rangeStart("1M", "2026-03-31")).toBe("2026-02-28");
  });
});

describe("availableRanges", () => {
  it("2½ months of history: 1W, 1M, 3M and All (Chris's example)", () => {
    expect([...availableRanges("2026-09-10", "2026-11-25")].sort()).toEqual(["1M", "1W", "3M", "All"]);
  });
  it("a few days: the week, and All", () => {
    expect([...availableRanges("2026-11-21", "2026-11-25")].sort()).toEqual(["1W", "All"]);
  });
  it("early in the year YTD is short, so it's available", () => {
    const a = availableRanges("2025-12-01", "2026-02-10");
    expect(a.has("YTD")).toBe(true);
    expect(a.has("3M")).toBe(true); // the first to reach past the start
    expect(a.has("6M")).toBe(false);
  });
  it("long history: everything", () => {
    expect(availableRanges("2010-01-04", "2026-11-25").size).toBe(10);
  });
});

describe("windowState", () => {
  const s = {
    dates: ["2026-11-02", "2026-11-03", "2026-11-04"],
    values: [1, 2, 3],
    byTicker: { A: [1, 2, 3] },
    cashSeries: [0, 0, 0],
    events: [
      { date: "2026-11-02", kind: "start" },
      { date: "2026-11-04", kind: "mix" },
    ],
  } as unknown as PortfolioState;
  it("keeps the days from the start of the range", () => {
    const w = windowState(s, "2026-11-03");
    expect(w.dates).toEqual(["2026-11-03", "2026-11-04"]);
    expect(w.values).toEqual([2, 3]);
    expect(w.byTicker.A).toEqual([2, 3]);
    expect(w.events.map((e) => e.kind)).toEqual(["mix"]);
  });
  it("All leaves it alone", () => {
    expect(windowState(s, undefined)).toBe(s);
  });
});
