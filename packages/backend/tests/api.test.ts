import { describe, expect, it } from "vitest";
import { createTestDb, MockEmbedder } from "./helpers.js";
import { buildApp } from "../src/app.js";
import { createSearchService } from "../src/retrieval/search.js";
import { createIngestService } from "../src/services/ingest.js";
import { createMockReranker } from "../src/llm/rerank.js";
import { createMockExpander } from "../src/llm/expand.js";
import type { Config } from "../src/config.js";

function testConfig(): Config {
  return {
    HOST: "127.0.0.1",
    PORT: 4000,
    DATABASE_PATH: ":memory:",
    EMBEDDING_MODEL: "mock",
    EMBEDDING_DIM: 384,
    HF_CACHE: "./data/hf-cache",
    INGEST_SOURCES: "arxiv,rss,reddit",
    ARXIV_MAX_RESULTS: 30,
    ARXIV_DAYS_LOOKBACK: 7,
    FRONTEND_ORIGIN: "http://localhost:5173",
    LOG_LEVEL: "silent",
    SOURCES_CONFIG: undefined,
    AUTO_SEED: "false",
    RERANK_PROVIDER: "opencode-go",
    RERANK_MODEL: "deepseek-v4-flash",
    RERANK_API_KEY: "",
    RERANK_TOP_N: 25,
    RERANK_TIMEOUT_MS: 60_000,
    EXPAND_API_KEY: "",
    EXPANSIONS_PER_QUERY: 3,
    EXPAND_TIMEOUT_MS: 45_000,
  };
}

async function buildTestApp(withStages = false) {
  const db = createTestDb();
  const embedder = new MockEmbedder();
  const search = createSearchService(db, embedder, {
    rerankTopN: 10,
    expansionsPerQuery: 3,
    ...(withStages
      ? { reranker: () => createMockReranker(), expander: () => createMockExpander() }
      : {}),
  });
  const ingest = createIngestService(db, embedder, testConfig());
  const app = buildApp({ db, embedder, search, ingest, config: testConfig(), logger: false });
  await app.ready();
  return { app, db, embedder };
}

describe("API", () => {
  it("GET /api/health", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "curate-ai" });
    await app.close();
  });

  it("GET /api/stats reflects empty index", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/stats" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ documents: 0, chunks: 0, embeddingDim: 384 });
    await app.close();
  });

  it("POST /api/documents indexes a document, search finds it", async () => {
    const { app } = await buildTestApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/documents",
      payload: {
        title: "Semantic search with dense embeddings",
        url: "https://example.com/semantic",
        source: "Test",
        sourceType: "seed",
        summary: "Embeddings for semantic search.",
        content: "Dense embeddings map text to vectors. Cosine similarity measures closeness. Semantic search matches meaning, not just keywords.",
        tags: ["embeddings", "semantic"],
        publishedAt: "2025-02-01T00:00:00Z",
      },
    });
    expect(create.statusCode).toBe(201);
    const { documentId } = create.json();

    const search = await app.inject({ method: "GET", url: "/api/search?q=semantic%20embeddings" });
    expect(search.statusCode).toBe(200);
    const body = search.json();
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.some((r: { documentId: string }) => r.documentId === documentId)).toBe(true);

    await app.close();
  });

  it("POST /api/documents rejects duplicate url with 409", async () => {
    const { app } = await buildTestApp();
    const payload = {
      title: "Duplicate doc",
      url: "https://example.com/dup",
      source: "Test",
      sourceType: "manual",
      content: "Some unique content here for the duplicate test.",
    };
    const first = await app.inject({ method: "POST", url: "/api/documents", payload });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: "POST", url: "/api/documents", payload });
    expect(second.statusCode).toBe(409);
    await app.close();
  });

  it("GET /api/search returns 400 for invalid input", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/search?limit=99999" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
    await app.close();
  });

  it("POST /api/ingest seeds the corpus and updates stats", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "POST", url: "/api/ingest", payload: { mode: "seed" } });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.indexed.indexed).toBeGreaterThan(0);
    expect(body.run.status).toBe("completed");

    const stats = await app.inject({ method: "GET", url: "/api/stats" });
    expect(stats.json().documents).toBe(body.indexed.indexed);
    await app.close();
  });

  it("GET /api/search?mode=rerank reranks when a reranker is configured", async () => {
    const { app } = await buildTestApp(true);
    const seed = await app.inject({ method: "POST", url: "/api/ingest", payload: { mode: "seed" } });
    expect(seed.statusCode).toBe(202);

    const res = await app.inject({ method: "GET", url: "/api/search?q=hybrid%20fusion&mode=rerank&limit=3" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.mode).toBe("rerank");
    expect(body.meta.reranked).toBe(true);
    expect(body.results[0]?.rerankReason).toBeDefined();
    await app.close();
  });

  it("GET /api/search?mode=rerank falls back safely without a reranker", async () => {
    const { app } = await buildTestApp();
    const seed = await app.inject({ method: "POST", url: "/api/ingest", payload: { mode: "seed" } });
    expect(seed.statusCode).toBe(202);

    const res = await app.inject({ method: "GET", url: "/api/search?q=hybrid%20fusion&mode=rerank&limit=3" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.mode).toBe("rerank");
    expect(body.meta.reranked).toBe(false);
    expect(body.results.length).toBeGreaterThan(0);
    await app.close();
  });

  it("GET /api/search?mode=expand expands when an expander is configured", async () => {
    const { app } = await buildTestApp(true);
    const seed = await app.inject({ method: "POST", url: "/api/ingest", payload: { mode: "seed" } });
    expect(seed.statusCode).toBe(202);

    const res = await app.inject({ method: "GET", url: "/api/search?q=hybrid%20fusion&mode=expand&limit=3" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.mode).toBe("expand");
    expect(body.meta.expanded).toBe(true);
    expect(body.meta.expansions!.length).toBeGreaterThan(1);
    await app.close();
  });

  it("GET /api/search?mode=expand-rerank runs both stages", async () => {
    const { app } = await buildTestApp(true);
    const seed = await app.inject({ method: "POST", url: "/api/ingest", payload: { mode: "seed" } });
    expect(seed.statusCode).toBe(202);

    const res = await app.inject({ method: "GET", url: "/api/search?q=hybrid%20fusion&mode=expand-rerank&limit=3" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.mode).toBe("expand-rerank");
    expect(body.meta.expanded).toBe(true);
    expect(body.meta.reranked).toBe(true);
    expect(body.results[0]?.rerankReason).toBeDefined();
    await app.close();
  });

  it("DELETE /api/documents/:id removes from both indexes", async () => {
    const { app } = await buildTestApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/documents",
      payload: {
        title: "Delete me",
        url: "https://example.com/delete-me",
        source: "Test",
        sourceType: "manual",
        content: "This document will be deleted from the index.",
      },
    });
    const { documentId } = create.json();

    const before = await app.inject({ method: "GET", url: `/api/documents/${documentId}` });
    expect(before.statusCode).toBe(200);

    const del = await app.inject({ method: "DELETE", url: `/api/documents/${documentId}` });
    expect(del.statusCode).toBe(204);

    const after = await app.inject({ method: "GET", url: `/api/documents/${documentId}` });
    expect(after.statusCode).toBe(404);
    await app.close();
  });
});
