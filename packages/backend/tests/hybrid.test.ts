import { describe, expect, it } from "vitest";
import { rrfFuse, rankOnly } from "../src/retrieval/hybrid.js";

describe("rrfFuse", () => {
  it("ranks documents present in both lists above single-list docs", () => {
    const fused = rrfFuse([
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [{ id: "c" }, { id: "a" }],
    ]);
    // a: 1/61 + 1/62, c: 1/62 + 1/63, b: 1/63 → a > c > b
    expect(fused.get("a")!).toBeGreaterThan(fused.get("c")!);
    expect(fused.get("c")!).toBeGreaterThan(fused.get("b")!);
  });

  it("is symmetric to list order", () => {
    const l1 = [{ id: "a" }, { id: "b" }];
    const l2 = [{ id: "b" }, { id: "a" }];
    const f1 = rrfFuse([l1, l2]);
    const f2 = rrfFuse([l2, l1]);
    for (const [id, s] of f1) expect(f2.get(id)).toBeCloseTo(s, 10);
  });

  it("equals single-list ranking when only one list is present", () => {
    const fused = rrfFuse([[{ id: "a" }, { id: "b" }]]);
    expect(fused.get("a")!).toBeGreaterThan(fused.get("b")!);
  });

  it("handles empty lists", () => {
    expect(rrfFuse([]).size).toBe(0);
    expect(rrfFuse([[], []])).toEqual(new Map());
  });

  it("uses k = 60 by default with rank+1 denominator", () => {
    const fused = rrfFuse([[{ id: "a" }]]);
    expect(fused.get("a")).toBeCloseTo(1 / 61, 10);
  });
});

describe("rankOnly", () => {
  it("produces monotonically decreasing scores", () => {
    const scores = rankOnly([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(scores.get("a")!).toBeGreaterThan(scores.get("b")!);
    expect(scores.get("b")!).toBeGreaterThan(scores.get("c")!);
  });
});
