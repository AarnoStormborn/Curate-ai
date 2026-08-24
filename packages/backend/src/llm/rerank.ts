import type { Type } from "typebox";

/** A rerank verdict for a single candidate. */
export interface RerankVerdict {
  documentId: string;
  /** Relevance 0–1 (higher = more relevant). */
  relevance: number;
  /** LLM justification. */
  reason: string;
}

/** A candidate handed to the reranker. */
export interface RerankCandidate {
  documentId: string;
  title: string;
  snippet: string;
  source: string;
  sourceType: string;
  tags: string[];
}

export interface Reranker {
  readonly model: string;
  /**
   * Re-rank `candidates` (already order-preserved from the first stage) by
   * relevance to `query`. Must return a permutation of the provided ids.
   * Throw to trigger the caller's fail-soft fallback.
   */
  rerank(query: string, candidates: RerankCandidate[]): Promise<RerankVerdict[]>;
}

/**
 * Deterministic reranker for tests: no LLM, pure pass-through with an explicit
 * tie-break so plumbing (order, reasons, fallback) is testable offline.
 */
export function createMockReranker(): Reranker {
  return {
    model: "mock-reranker",
    async rerank(_query, candidates) {
      return candidates.map((c, i) => ({
        documentId: c.documentId,
        relevance: 1 - i / Math.max(candidates.length, 1) / 2,
        reason: "mock relevance",
      }));
    },
  };
}

// Re-export the type so consumers can annotate without importing typebox.
export type { Type };