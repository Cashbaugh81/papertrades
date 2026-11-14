import { describe, expect, it } from "vitest";
import { evenSplit, mixFromRows, spreadEvenly } from "@/components/MixEditor";

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
