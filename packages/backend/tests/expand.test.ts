import { describe, expect, it, vi } from "vitest";
import { createTestDb, MockEmbedder } from "./helpers.js";
import { createSearchService } from "../src/retrieval/search.js";
import { createMockExpander, type QueryExpander } from "../src/llm/expand.js";
import { createMockReranker } from "../src/llm/rerank.js";
import { indexDocuments } from "../src/retrieval/indexer.js";
import { SAMPLE_DOCS } from "./helpers.js";

describe("expand modes", () => {
  async function setup(opts: { expander?: () => QueryExpander; reranker?: boolean } = {}) {
    const db = createTestDb();
    const embedder = new MockEmbedder();
    await indexDocuments(db, embedder, SAMPLE_DOCS);
    const search = createSearchService(db, embedder, {
      rerankTopN: 10,
      expansionsPerQuery: 3,
      ...(opts.expander ? { expander: opts.expander } : {}),
      ...(opts.reranker ? { reranker: () => createMockReranker() } : {}),
    });
    return { search };
  }

  it("expand mode expands the query and reports expansions", async () => {
    const { search } = await setup({ expander: () => createMockExpander() });
    const res = await search.search({ q: "vector index", limit: 3, mode: "expand" });
    expect(res.meta.mode).toBe("expand");
    expect(res.meta.expanded).toBe(true);
    expect(res.meta.expansions!.length).toBeGreaterThan(1);
    expect(res.meta.expansions![0]).toBe("vector index");
    expect(res.results.length).toBeGreaterThan(0);
  });

  it("expand mode falls back to single query when no expander is configured", async () => {
    const { search } = await setup();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await search.search({ q: "vector index", limit: 3, mode: "expand" });
    expect(spy).toHaveBeenCalled();
    expect(res.meta.expanded).toBe(false);
    expect(res.results.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it("expand-rerank runs both stages", async () => {
    const { search } = await setup({ expander: () => createMockExpander(), reranker: true });
    const res = await search.search({ q: "retrieval fusion", limit: 3, mode: "expand-rerank" });
    expect(res.meta.mode).toBe("expand-rerank");
    expect(res.meta.expanded).toBe(true);
    expect(res.meta.reranked).toBe(true);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0]?.rerankReason).toBeDefined();
  });

  it("expand-rerank falls back gracefully when only expander is available", async () => {
    const { search } = await setup({ expander: () => createMockExpander() });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await search.search({ q: "retrieval", limit: 3, mode: "expand-rerank" });
    expect(res.meta.expanded).toBe(true);
    expect(res.meta.reranked).toBe(false);
    expect(res.results.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});