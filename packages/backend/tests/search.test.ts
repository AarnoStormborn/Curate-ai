import { describe, expect, it } from "vitest";
import { createTestDb, MockEmbedder, SAMPLE_DOCS, seedSampleDocs } from "./helpers.js";
import { bm25Search, toFtsQuery } from "../src/retrieval/bm25.js";
import { vectorSearch } from "../src/retrieval/vector.js";
import { createSearchService } from "../src/retrieval/search.js";

describe("toFtsQuery", () => {
  it("quotes and ANDs tokens", () => {
    expect(toFtsQuery("hybrid search")).toBe('"hybrid" "search"');
  });
  it("strips FTS operators", () => {
    expect(toFtsQuery('NOT "vector" OR')).toBe('"not" "vector" "or"');
  });
  it("returns null for empty", () => {
    expect(toFtsQuery("   ")).toBeNull();
  });
});

describe("retrieval techniques", () => {
  it("bm25 finds exact-term documents", async () => {
    const db = createTestDb();
    await seedSampleDocs(db, new MockEmbedder());
    const hits = bm25Search(db, "LoRA fine-tuning adapters", 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.title).toContain("LoRA");
    expect(hits[0]!.score).toBeGreaterThan(0);
  });

  it("bm25 handles queries with no matches", async () => {
    const db = createTestDb();
    await seedSampleDocs(db, new MockEmbedder());
    expect(bm25Search(db, "zzzqqqxxyy", 10)).toEqual([]);
  });

  it("vector search returns chunk-level hits", async () => {
    const db = createTestDb();
    const embedder = new MockEmbedder();
    await seedSampleDocs(db, embedder);
    const [q] = await embedder.embed(["vector database index embeddings"]);
    const hits = vectorSearch(db, q!, 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.documentId).toBeTruthy();
    expect(hits[0]!.distance).toBeLessThanOrEqual(1.0);
  });
});

describe("hybrid search orchestration", () => {
  it("returns results with score breakdown and snippets", async () => {
    const db = createTestDb();
    const embedder = new MockEmbedder();
    await seedSampleDocs(db, embedder);
    const search = createSearchService(db, embedder);

    const res = await search.search({ q: "hybrid retrieval fusion", limit: 5, hybrid: true });
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.meta.candidates).toBeGreaterThan(0);
    for (const r of res.results) {
      expect(r.score.rrf).toBeGreaterThan(0);
      expect(r.score.from.length).toBeGreaterThan(0);
      expect(r.snippet).toBeDefined();
      expect(r.title).toBeTruthy();
    }
  });

  it("bm25-only mode (hybrid=false) still works", async () => {
    const db = createTestDb();
    const embedder = new MockEmbedder();
    await seedSampleDocs(db, embedder);
    const search = createSearchService(db, embedder);

    const res = await search.search({ q: "LoRA", limit: 5, hybrid: false });
    expect(res.results[0]!.title).toContain("LoRA");
    expect(res.results[0]!.score.from).toEqual(["bm25"]);
  });

  it("applies sourceType and date filters", async () => {
    const db = createTestDb();
    const embedder = new MockEmbedder();
    await seedSampleDocs(db, embedder);
    const search = createSearchService(db, embedder);

    const res = await search.search({
      q: "retrieval",
      limit: 10,
      sourceType: "reddit",
    });
    expect(res.results).toEqual([]);

    const dated = await search.search({ q: "retrieval", limit: 10, from: "2025-01-03T00:00:00Z" });
    for (const r of dated.results) {
      expect(r.publishedAt! >= "2025-01-03T00:00:00Z").toBe(true);
    }
  });

  it("handles empty corpus gracefully", async () => {
    const db = createTestDb();
    const search = createSearchService(db, new MockEmbedder());
    const res = await search.search({ q: "anything", limit: 5 });
    expect(res.results).toEqual([]);
  });
});
