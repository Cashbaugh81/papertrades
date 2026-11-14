import { describe, expect, it } from "vitest";
import { ordinal, rankTints, tintColors } from "@/lib/rankTint";

describe("rank tints", () => {
  it("best is +1, worst is −1, the middle is neutral", () => {
    const r = rankTints([
      { key: 1, value: 0.1 },
      { key: 2, value: 0.5 },
      { key: 3, value: -0.2 },
    ]);
    expect(r.get(2)).toEqual({ rank: 1, of: 3, t: 1 });
    expect(r.get(1)).toEqual({ rank: 2, of: 3, t: 0 });
    expect(r.get(3)).toEqual({ rank: 3, of: 3, t: -1 });
  });

  it("spreads evenly across ten", () => {
    const r = rankTints(Array.from({ length: 10 }, (_, i) => ({ key: i + 1, value: i })));
    expect(r.get(10)!.t).toBe(1);
    expect(r.get(1)!.t).toBe(-1);
    expect(r.get(6)!.t).toBeCloseTo(1 / 9);
  });

  it("ties share a rank and a shade", () => {
    const r = rankTints([
      { key: 1, value: 0.2 },
      { key: 2, value: 0.2 },
      { key: 3, value: 0.1 },
    ]);
    expect(r.get(1)!.rank).toBe(1);
    expect(r.get(2)!.rank).toBe(1);
    expect(r.get(1)!.t).toBe(r.get(2)!.t);
    expect(r.get(3)!.rank).toBe(3);
  });

  it("nothing to rank with fewer than two", () => {
    expect(rankTints([{ key: 1, value: 0.3 }]).size).toBe(0);
  });

  it("neutral is plain white; ends are light tints", () => {
    expect(tintColors(0).background).toBe("#ffffff");
    expect(tintColors(1).background).toBe("#e4ede9");
    expect(tintColors(-1).background).toBe("#f4e7e5");
  });

  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});
