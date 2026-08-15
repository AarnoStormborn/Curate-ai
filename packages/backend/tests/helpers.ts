import type Database from "better-sqlite3";
import type { DocumentInput } from "@curate-ai/shared";
import type { Embedder } from "../src/embeddings/types.js";
import { openDb } from "../src/db/client.js";

/** Deterministic word-hash embedder — no network, no model download, stable across runs. */
export class MockEmbedder implements Embedder {
  readonly model = "mock-mini";
  readonly dim = 384;

  private wordVec(word: string): Float32Array {
    const v = new Float32Array(this.dim);
    let h = 2166136261;
    for (let i = 0; i < word.length; i++) {
      h ^= word.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    for (let i = 0; i < 12; i++) {
      h = Math.imul(h ^ (h >>> 15), 2246822519);
      h ^= h >>> 13;
      const idx = Math.abs(h) % this.dim;
      v[idx] = (Math.abs(h) % 1000) / 1000;
    }
    return v;
  }

  embed(texts: string[]): Promise<Float32Array[]> {
    const out = texts.map((text) => {
      const sum = new Float32Array(this.dim);
      for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
        const v = this.wordVec(word);
        for (let i = 0; i < this.dim; i++) sum[i]! += v[i]!;
      }
      let norm = 0;
      for (let i = 0; i < this.dim; i++) norm += sum[i]! * sum[i]!;
      norm = Math.sqrt(norm);
      if (norm > 0) for (let i = 0; i < this.dim; i++) sum[i] = sum[i]! / norm;
      return sum;
    });
    return Promise.resolve(out);
  }
}

export function createTestDb(): Database.Database {
  return openDb(":memory:", 384);
}

export const SAMPLE_DOCS: DocumentInput[] = [
  {
    title: "Vector databases and ANN indexes",
    url: "https://example.com/vector-db",
    source: "Test",
    sourceType: "seed",
    summary: "How ANN indexes like HNSW make vector search fast.",
    content:
      "Vector databases index embeddings for nearest neighbor search. HNSW builds a hierarchical graph for fast approximate search. IVF partitions the space with k-means centroids. SQLite hosts vector search via the sqlite-vec extension. Embeddings power semantic search and recommendation systems.",
    tags: ["vector", "hnsw", "sqlite"],
    publishedAt: "2025-01-01T00:00:00Z",
    metadata: {},
  },
  {
    title: "Hybrid search with reciprocal rank fusion",
    url: "https://example.com/rrf",
    source: "Test",
    sourceType: "seed",
    summary: "Fusing BM25 and dense retrieval.",
    content:
      "Hybrid search combines sparse keyword retrieval with dense semantic retrieval. Reciprocal rank fusion merges ranked lists without calibrating scores. BM25 ranks by term frequency. Dense vectors rank by cosine similarity. Fusing both is more robust than either alone.",
    tags: ["hybrid", "bm25", "rrf"],
    publishedAt: "2025-01-02T00:00:00Z",
    metadata: {},
  },
  {
    title: "Chunking strategies for retrieval",
    url: "https://example.com/chunking",
    source: "Test",
    sourceType: "seed",
    summary: "Splitting documents into embeddable chunks.",
    content:
      "Chunking splits documents before embedding. Sentence-aligned chunks preserve grammatical units. Overlap prevents information loss at boundaries. Small chunks improve precision, large chunks preserve context. The chunk size determines retrieval quality.",
    tags: ["chunking", "rag"],
    publishedAt: "2025-01-03T00:00:00Z",
    metadata: {},
  },
  {
    title: "Fine-tuning language models with LoRA",
    url: "https://example.com/lora",
    source: "Test",
    sourceType: "seed",
    summary: "Training small adapters for new domains.",
    content:
      "LoRA freezes the base model and trains low-rank adapters. QLoRA combines quantization with LoRA for consumer hardware. Fine-tuning beats prompting for style and format. Adapters swap at inference without duplicating the model.",
    tags: ["lora", "fine-tuning"],
    publishedAt: "2025-01-04T00:00:00Z",
    metadata: {},
  },
];

export function seedSampleDocs(db: Database.Database, embedder: Embedder): Promise<number> {
  // Direct inline reimplementation to avoid indexer import cycle in helpers.
  return import("../src/retrieval/indexer.js").then(({ indexDocuments }) =>
    indexDocuments(db, embedder, SAMPLE_DOCS).then((r) => r.indexed),
  );
}
