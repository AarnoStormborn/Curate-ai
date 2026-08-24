import { describe, expect, it } from "vitest";
import { dcgAtK, mean, ndcgAtK, recallAtK, reciprocalRank } from "../src/retrieval/metrics.js";

const A = { documentId: "a" };
const B = { documentId: "b" };
const C = { documentId: "c" };
const D = { documentId: "d" };

describe("recallAtK", () => {
  const relevant = new Set(["a", "c"]);

  it("counts found / total within top-k", () => {
    expect(recallAtK([A, B, C], relevant, 3)).toBe(1);
    expect(recallAtK([A, B, C], relevant, 2)).toBe(0.5);
    expect(recallAtK([B, D], relevant, 2)).toBe(0);
  });

  it("is bounded by k", () => {
    // Both relevant docs are past position 10.
    expect(recallAtK([B, C, D, A], relevant, 10)).toBe(1);
    expect(recallAtK([C, D, A], relevant, 2)).toBe(0.5);
  });

  it("returns 0 when nothing is relevant", () => {
    expect(recallAtK([A], new Set(), 5)).toBe(0);
  });
});

describe("reciprocalRank", () => {
  const relevant = new Set(["c"]);

  it("is 1/rank of the first relevant hit", () => {
    expect(reciprocalRank([A, B, C, D], relevant)).toBe(1 / 3);
    expect(reciprocalRank([C, A, B], relevant)).toBe(1);
  });

  it("is 0 when no hit is relevant", () => {
    expect(reciprocalRank([A, B, D], relevant)).toBe(0);
  });
});

describe("dcgAtK / ndcgAtK", () => {
  const relevant = new Set(["a", "c"]);

  it("dcg: rel_i / log2(i+1), 1-indexed", () => {
    // a at rank1: 1/log2(2)=1 ; c at rank3: 1/log2(4)=0.5
    expect(dcgAtK([A, B, C], relevant, 3)).toBeCloseTo(1.5, 10);
    // a at rank2: 1/log2(3)≈0.6309 ; c at rank4: 1/log2(5)≈0.4307
    expect(dcgAtK([B, A, D, C], relevant, 4)).toBeCloseTo(0.6309 + 0.4307, 2);
  });

  it("ndcg of the ideal ranking is 1", () => {
    expect(ndcgAtK([A, C, B, D], relevant, 4)).toBeCloseTo(1, 10);
  });

  it("ndcg rewards relevant-before-irrelevant ordering", () => {
    const good = ndcgAtK([A, C, B, D], relevant, 4);
    const bad = ndcgAtK([B, D, A, C], relevant, 4);
    expect(good).toBeGreaterThan(bad);
    expect(bad).toBeLessThan(1);
  });

  it("is 0 when nothing is relevant", () => {
    expect(ndcgAtK([A], new Set(), 5)).toBe(0);
  });

  it("handles k smaller than the hit list", () => {
    expect(ndcgAtK([A, C, B], relevant, 1)).toBe(1); // only rank 1 counted
  });
});

describe("mean", () => {
  it("averages and handles empty", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBe(0);
  });
});
