import { describe, expect, it } from "vitest";
import { normaliseQuery, parseSearch } from "@/server/search";

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
