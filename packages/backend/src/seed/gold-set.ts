import type { GoldQuery } from "../retrieval/evaluate.js";

/**
 * Gold set for retrieval evaluation.
 *
 * Queries reference seed-corpus documents by URL (the schema's unique key), so
 * the set stays valid across re-seeds. Add your own queries for live-fetched
 * documents by using their URLs.
 *
 * Mixed by design:
 *  - exact-term queries  → BM25 should win
 *  - paraphrased queries → vector should win
 *  - hybrid queries      → both signals matter
 */
export const GOLD_SET: GoldQuery[] = [
  // ---- Transformer / attention ------------------------------------------
  {
    query: "what is the transformer architecture",
    relevantUrls: ["https://arxiv.org/abs/1706.03762"],
  },
  {
    query: "attention mechanism for sequence modeling without recurrence",
    relevantUrls: ["https://arxiv.org/abs/1706.03762"],
  },

  // ---- RAG ----------------------------------------------------------------
  {
    query: "how does retrieval augmented generation work",
    relevantUrls: ["https://arxiv.org/abs/2005.11401"],
  },
  {
    query: "grounding language model answers in an external knowledge corpus",
    relevantUrls: ["https://arxiv.org/abs/2005.11401"],
  },

  // ---- Embeddings ----------------------------------------------------------
  {
    query: "text embeddings semantic similarity cosine distance",
    relevantUrls: ["https://example.com/embeddings-guide"],
  },
  {
    query: "turning text into vectors so similar meanings are close together",
    relevantUrls: ["https://example.com/embeddings-guide"],
  },

  // ---- Vector databases ----------------------------------------------------
  {
    query: "vector database index embeddings nearest neighbor",
    relevantUrls: ["https://example.com/vector-databases"],
  },
  {
    query: "hnsw graph approximate nearest neighbor index",
    relevantUrls: ["https://example.com/vector-databases"],
  },
  {
    query: "approximate search over millions of vectors",
    relevantUrls: ["https://example.com/vector-databases"],
  },

  // ---- Hybrid search / RRF -------------------------------------------------
  {
    query: "reciprocal rank fusion",
    relevantUrls: ["https://example.com/rrf-explained"],
  },
  {
    query: "combining keyword and semantic retrieval without score calibration",
    relevantUrls: ["https://example.com/rrf-explained"],
  },
  {
    query: "fusing sparse and dense ranked lists",
    relevantUrls: ["https://example.com/rrf-explained", "https://example.com/bm25-fts5"],
  },

  // ---- BM25 / FTS5 ----------------------------------------------------------
  {
    query: "bm25 ranking function",
    relevantUrls: ["https://example.com/bm25-fts5"],
  },
  {
    query: "sqlite full text search fts5",
    relevantUrls: ["https://example.com/bm25-fts5"],
  },
  {
    query: "why keyword search still matters for exact terms",
    relevantUrls: ["https://example.com/bm25-fts5"],
  },

  // ---- Chunking -------------------------------------------------------------
  {
    query: "how to split documents into chunks for rag",
    relevantUrls: ["https://example.com/chunking-strategies"],
  },
  {
    query: "chunk overlap and sentence boundaries for embedding quality",
    relevantUrls: ["https://example.com/chunking-strategies"],
  },

  // ---- Reranking -------------------------------------------------------------
  {
    query: "cross encoder reranking",
    relevantUrls: ["https://example.com/reranking"],
  },
  {
    query: "two stage retrieval cheap candidates then precise rerank",
    relevantUrls: ["https://example.com/reranking"],
  },

  // ---- Agents ---------------------------------------------------------------
  {
    query: "llm agents calling tools with structured arguments",
    relevantUrls: ["https://example.com/agents-tools"],
  },

  // ---- Quantization / local models ------------------------------------------
  {
    query: "quantized models gguf 4 bit weights",
    relevantUrls: ["https://example.com/quantization"],
  },
  {
    query: "running large models on a laptop with limited memory",
    relevantUrls: [
      "https://www.reddit.com/r/LocalLLaMA/comments/example",
      "https://example.com/quantization",
    ],
  },

  // ---- Fine-tuning -----------------------------------------------------------
  {
    query: "lora fine tuning low rank adapters",
    relevantUrls: ["https://example.com/lora-finetuning"],
  },
  {
    query: "training a small adapter instead of the whole model",
    relevantUrls: ["https://example.com/lora-finetuning"],
  },

  // ---- Eval ------------------------------------------------------------------
  {
    query: "evaluating rag systems recall metrics",
    relevantUrls: ["https://example.com/rag-evals"],
  },
  {
    query: "how to measure retrieval quality before tuning the pipeline",
    relevantUrls: ["https://example.com/rag-evals"],
  },

  // ---- MCP --------------------------------------------------------------------
  {
    query: "model context protocol mcp",
    relevantUrls: ["https://example.com/mcp-guide"],
  },
];
