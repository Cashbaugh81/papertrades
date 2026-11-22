import { describe, expect, it } from "vitest";
import { evenSplit, mixFromRows, rowsFromMix, shareText, spreadEvenly } from "@/components/MixEditor";

describe("even split", () => {
  it("splits 100% into whole numbers that add to exactly 100", () => {
    expect(evenSplit(1)).toEqual(["100"]);
    expect(evenSplit(2)).toEqual(["50", "50"]);
    expect(evenSplit(3)).toEqual(["34", "33", "33"]);
    expect(evenSplit(7)).toEqual(["15", "15", "14", "14", "14", "14", "14"]);
    for (let n = 1; n <= 8; n++) expect(evenSplit(n).reduce((a, p) => a + Number(p), 0)).toBe(100);
  });

  it("resets every row, including ones edited by hand", () => {
    expect(spreadEvenly([{ ticker: "NFLX", pct: "80" }, { ticker: "", pct: "" }])).toEqual([
      { ticker: "NFLX", pct: "50" },
      { ticker: "", pct: "50" },
    ]);
  });

  it("a hand-edited mix that doesn't add to 100 is refused on save", () => {
    const info = { DIS: { status: "ok" }, NFLX: { status: "ok" } } as never;
    const r = mixFromRows([{ ticker: "DIS", pct: "60" }, { ticker: "NFLX", pct: "30" }], info);
    expect(r.mix).toBeUndefined();
    expect(r.problem).toMatch(/90%, not 100%/);
  });
});

describe("buying by shares", () => {
  const info = { DIS: { status: "ok" }, NFLX: { status: "ok" } } as never;

  it("a mix set by shares may keep cash back; its weights are the exact share cost", () => {
    // 20 DIS at $100 = $2,000 (20%) and 7 NFLX at $1,000 = $7,000 (70%) out of $10,000.
    const r = mixFromRows(
      [
        { ticker: "DIS", pct: "20", shares: "20", exact: 20 },
        { ticker: "NFLX", pct: "70", shares: "7", exact: 70 },
      ],
      info,
      10_000,
    );
    expect(r.problem).toBeUndefined();
    expect(r.mix).toEqual({ DIS: 0.2, NFLX: 0.7 });
  });

  it("can't buy more than the starting amount", () => {
    const r = mixFromRows([{ ticker: "DIS", pct: "112.5", shares: "1125", exact: 112.5 }], info, 10_000);
    expect(r.problem).toBe("That's $1,250 more than the $10,000 you start with.");
  });

  it("a shares row needs shares", () => {
    const r = mixFromRows([{ ticker: "DIS", pct: "", shares: "", exact: 0 }], info, 10_000);
    expect(r.problem).toMatch(/number of shares above zero/);
  });

  it("a mix that kept cash reopens in shares mode, so it saves unchanged", () => {
    const rows = rowsFromMix({ DIS: 0.2, NFLX: 0.7 });
    expect(rows.every((x) => x.shares === "")).toBe(true);
    expect(mixFromRows(rows, info, 10_000).mix).toEqual({ NFLX: 0.7, DIS: 0.2 });
    expect(rowsFromMix({ DIS: 0.5, NFLX: 0.5 })[0].shares).toBeUndefined();
  });

  it("shows fractional shares with up to four decimals", () => {
    expect(shareText(44.739126)).toBe("44.7391");
    expect(shareText(0.25)).toBe("0.25");
    expect(shareText(20)).toBe("20");
  });
});
