import { describe, expect, it } from "vitest";
import { aliasHits, mergeHits, normaliseQuery, parseSearch } from "@/server/search";

describe("ticker search", () => {
  it("normalises queries for caching", () => {
    expect(normaliseQuery("  NetFlix  ")).toBe("netflix");
    expect(normaliseQuery("Berkshire   Hathaway, Inc.")).toBe("berkshire hathaway inc.");
    expect(normaliseQuery("n")).toBeUndefined();
    expect(normaliseQuery("x".repeat(41))).toBeUndefined();
  });

  it("keeps active stocks, ETFs and funds, best match first", () => {
    const tiingo = [
      { ticker: "nflx", name: "Netflix Inc", assetType: "Stock", isActive: true },
      { ticker: "NFLX.OLD", name: "Netflix old", assetType: "Stock", isActive: false },
      { ticker: "NFLY", name: "YieldMax NFLX Option Income Strategy ETF", assetType: "ETF", isActive: true },
      { ticker: "BTCNFLX", name: "Netflix token", assetType: "Crypto", isActive: true },
      { ticker: "nflx", name: "dupe", assetType: "Stock", isActive: true },
    ];
    expect(parseSearch(tiingo, "netflix").map((h) => h.ticker)).toEqual(["NFLX", "NFLY"]);
    // An exact ticker comes first even if Tiingo lists it later.
    expect(parseSearch([tiingo[2], tiingo[0]], "nflx").map((h) => h.ticker)).toEqual(["NFLX", "NFLY"]);
    expect(parseSearch({ error: "nope" }, "x")).toEqual([]);
  });
});

describe("names people use that the listing doesn't", () => {
  it("finds Alphabet for google, SpaceX however it's spaced, Meta for facebook", () => {
    expect(aliasHits("google").map((h) => h.ticker)).toEqual(["GOOGL", "GOOG"]);
    expect(aliasHits("space x")[0].ticker).toBe("SPCX");
    expect(aliasHits("Space-X")[0].ticker).toBe("SPCX");
    expect(aliasHits("spacex")[0].ticker).toBe("SPCX");
    expect(aliasHits("facebook")[0].ticker).toBe("META");
    expect(aliasHits("s&p 500").map((h) => h.ticker)).toContain("VOO");
  });

  it("matches the start of a longer query, but not a short or unrelated one", () => {
    expect(aliasHits("google stock")[0].ticker).toBe("GOOGL");
    expect(aliasHits("space x shares")[0].ticker).toBe("SPCX");
    expect(aliasHits("netflix")).toEqual([]);
    expect(aliasHits("go")).toEqual([]);
  });

  it("puts alias hits first and drops repeats", () => {
    const tiingo = [
      { ticker: "UGOO", name: "KURV GOOGLE 1.75X LONG DAILY ETF", assetType: "ETF" },
      { ticker: "GOOGL", name: "Alphabet Inc - Class A", assetType: "Stock" },
    ];
    expect(mergeHits(aliasHits("google"), tiingo).map((h) => h.ticker)).toEqual(["GOOGL", "GOOG", "UGOO"]);
  });
});
