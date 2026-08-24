import { describe, expect, it } from "vitest";
import { createTestDb, MockEmbedder } from "./helpers.js";
import { createSearchService } from "../src/retrieval/search.js";
import { evaluate, EVAL_MODES } from "../src/retrieval/evaluate.js";
import { GOLD_SET } from "../src/seed/gold-set.js";
import { SEED_DOCUMENTS } from "../src/seed/corpus.js";
import { indexDocuments } from "../src/retrieval/indexer.js";
import { getDocumentByUrl } from "../src/db/repo.js";

/**
 * End-to-end eval over the full seed corpus with the deterministic mock
 * embedder. Asserts structural properties (metrics in range, mode plumbing)
 * rather than specific rankings, since the mock embedder is not semantically
 * meaningful — the real model's quality is measured by `pnpm eval`.
 */
describe("evaluate", () => {
  async function setup() {
    const db = createTestDb();
    const embedder = new MockEmbedder();
    await indexDocuments(db, embedder, SEED_DOCUMENTS);
    const search = createSearchService(db, embedder);
    const resolveUrl = (url: string): string | null => getDocumentByUrl(db, url)?.id ?? null;
    return { db, search, resolveUrl };
  }

  it("runs every mode and produces well-formed aggregates", async () => {
    const { search, resolveUrl } = await setup();
    for (const mode of EVAL_MODES) {
      const result = await evaluate(search, GOLD_SET, mode, { k: 5, resolveUrl });
      expect(result.mode).toBe(mode);
      expect(result.aggregate.queriesEvaluated).toBe(GOLD_SET.length);
      // Sanity floor only: the mock embedder is deliberately weak on semantic
      // queries, so the harness test must not assert quality — that's what the
      // real-model CLI eval (`pnpm eval`) measures.
      expect(result.aggregate.queriesWithRelevant).toBeGreaterThanOrEqual(10);
      for (const metric of [result.aggregate.recallAtK, result.aggregate.mrr, result.aggregate.ndcgAtK]) {
        expect(metric).toBeGreaterThanOrEqual(0);
        expect(metric).toBeLessThanOrEqual(1);
      }
      for (const q of result.queries) {
        expect(q.hitIds.length).toBeLessThanOrEqual(5);
        expect(q.recallAtK).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("mode plumbing: vector-only results carry only vector signals", async () => {
    const { search, resolveUrl } = await setup();
    const result = await evaluate(search, GOLD_SET, "vector", { k: 5, resolveUrl });
    for (const q of result.queries) {
      // Confirm via a direct search that vector mode returns vector-scored hits.
      const res = await search.search({ q: q.query, limit: 5, mode: "vector" });
      for (const r of res.results) {
        expect(r.score.from).toEqual(["vector"]);
      }
    }
  });

  it("bm25 finds exact-term queries (reciprocal rank fusion)", async () => {
    const { search, resolveUrl } = await setup();
    const result = await evaluate(search, GOLD_SET, "bm25", { k: 10, resolveUrl });
    const rrfQuery = result.queries.find((q) => q.query === "reciprocal rank fusion");
    expect(rrfQuery).toBeDefined();
    expect(rrfQuery!.recallAtK).toBe(1);
  });

  it("skipUnresolved skips queries whose docs are not indexed", async () => {
    const { search, resolveUrl } = await setup();
    const withUnknown = [
      { query: "something", relevantUrls: ["https://not-indexed.example/doc"] },
      ...GOLD_SET.slice(0, 2),
    ];
    const result = await evaluate(search, withUnknown, "hybrid", { k: 5, resolveUrl });
    expect(result.aggregate.skippedUnresolved).toBe(1);
    expect(result.aggregate.queriesEvaluated).toBe(2);
  });
});
