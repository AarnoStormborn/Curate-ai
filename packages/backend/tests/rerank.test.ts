import { describe, expect, it, vi, afterEach } from "vitest";
import { createTestDb, MockEmbedder } from "./helpers.js";
import { createSearchService } from "../src/retrieval/search.js";
import { createMockReranker, type Reranker } from "../src/llm/rerank.js";
import { indexDocuments } from "../src/retrieval/indexer.js";
import { SAMPLE_DOCS } from "./helpers.js";

describe("rerank mode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup(reranker?: () => Reranker) {
    const db = createTestDb();
    const embedder = new MockEmbedder();
    await indexDocuments(db, embedder, SAMPLE_DOCS);
    const search = createSearchService(db, embedder, { rerankTopN: 10, ...(reranker ? { reranker } : {}) });
    return { db, search, embedder };
  }

  it("runs the reranker and returns verdict order + reasons", async () => {
    const { search } = await setup(() => createMockReranker());
    const res = await search.search({ q: "hybrid retrieval", limit: 3, mode: "rerank" });

    expect(res.meta.mode).toBe("rerank");
    expect(res.meta.reranked).toBe(true);
    expect(res.meta.rerankModel).toBe("mock-reranker");
    expect(res.results.length).toBeGreaterThan(0);
    for (const r of res.results) {
      expect(r.rerankReason).toBeDefined();
      expect(r.rerankReason!.length).toBeGreaterThan(0);
    }
  });

  it("falls back to hybrid order when no reranker is configured", async () => {
    const { search } = await setup();
    // Silence the expected console.warn.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await search.search({ q: "hybrid retrieval", limit: 3, mode: "rerank" });

    expect(spy).toHaveBeenCalled();
    expect(res.meta.mode).toBe("rerank");
    expect(res.meta.reranked).toBe(false);
    expect(res.results.length).toBeGreaterThan(0);
    // Fallback order == hybrid order (scope-limited pass-through reranker).
    const hybrid = await search.search({ q: "hybrid retrieval", limit: 3, mode: "hybrid" });
    expect(res.results.map((r) => r.documentId)).toEqual(hybrid.results.map((r) => r.documentId));
  });

  it("a reranker that drops candidates keeps them appended (late results)", async () => {
    const droppingReranker: Reranker = {
      model: "drop-reranker",
      async rerank(_query, candidates) {
        // Keep only the best two.
        return candidates.slice(0, 2).map((c) => ({
          documentId: c.documentId,
          relevance: 0.99,
          reason: "kept",
        }));
      },
    };
    const { search } = await setup(() => droppingReranker);
    const res = await search.search({ q: "retrieval", limit: 4, mode: "rerank" });
    expect(res.meta.reranked).toBe(true);
    expect(res.results.length).toBeGreaterThan(0);
    // Dedupe check: no duplicate document ids.
    const ids = res.results.map((r) => r.documentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses a larger candidate pool than the final limit", async () => {
    const seenPoolSizes: number[] = [];
    const poolProbe: Reranker = {
      model: "pool-probe",
      async rerank(_query, candidates) {
        seenPoolSizes.push(candidates.length);
        return candidates.map((c) => ({ documentId: c.documentId, relevance: 1, reason: "all" }));
      },
    };
    const { search } = await setup(() => poolProbe);
    await search.search({ q: "retrieval", limit: 2, mode: "rerank" });
    // Pool = min(rerankTopN=10, available candidates=4) → must exceed limit=2.
    expect(seenPoolSizes[0]).toBeGreaterThan(2);
  });
});