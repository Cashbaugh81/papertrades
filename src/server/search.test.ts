import { describe, expect, it } from "vitest";
import { aliasHits, mergeHits, nameCore, normaliseQuery, parseSearch, rank } from "@/server/search";

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

describe("the company's main listing comes first", () => {
  const hit = (ticker: string, name: string, assetType = "Stock") => ({ ticker, name, assetType });

  it("puts TSLA above ZTSL and the Tesla funds", () => {
    const tiingo = [
      hit("ZTSL", "Tesla Inc"),
      hit("TSLA", "Tesla Inc"),
      hit("TXLZF", "Tesla Exploration Ltd"),
      hit("YTSL", "Tesla (TSLA) Yield Shares Purpose ETF", "ETF"),
      hit("TSHI", "Ninepoint Tesla HighShares ETF", "ETF"),
      hit("TSLT", "T-REX 2X LONG TESLA DAILY TARGET ETF", "ETF"),
    ];
    expect(rank(tiingo, "tesla").map((h) => h.ticker).slice(0, 2)).toEqual(["TSLA", "ZTSL"]);
    expect(rank(tiingo, "tesla").map((h) => h.ticker).indexOf("TXLZF")).toBeGreaterThan(1);
  });

  it("prefers the company named over others that start the same", () => {
    const tiingo = [hit("APLE", "Apple Hospitality REIT Inc"), hit("AAPL", "Apple Inc")];
    expect(rank(tiingo, "apple")[0].ticker).toBe("AAPL");
  });

  it("puts the plain listing above overseas OTC shares", () => {
    const tiingo = [hit("NSRGY", "Nestle SA"), hit("NSRGF", "Nestle SA")];
    expect(rank([hit("TOYOF", "Toyota Motor Corp"), hit("TM", "Toyota Motor Corp")], "toyota")[0].ticker).toBe("TM");
    expect(rank(tiingo, "nestle").map((h) => h.ticker)).toEqual(["NSRGY", "NSRGF"]);
  });

  it("strips the legal bits from names", () => {
    expect(nameCore("Tesla, Inc.")).toBe("tesla");
    expect(nameCore("Alphabet Inc - Class A")).toBe("alphabet");
    expect(nameCore("The Coca-Cola Co")).toBe("the coca cola");
  });
});
