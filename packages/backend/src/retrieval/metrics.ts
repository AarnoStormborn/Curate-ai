/**
 * Information-retrieval metrics — pure functions, unit-tested.
 *
 * Relevance is binary (a doc is either in the gold set for a query or not).
 */

export interface RankedResult {
  documentId: string;
}

/** Binary relevance flags for hits against the gold set (top-k implied by caller). */
export function relevanceFlags(hits: RankedResult[], relevant: ReadonlySet<string>): boolean[] {
  return hits.map((h) => relevant.has(h.documentId));
}

/** Fraction of relevant documents found in the top-k (0 if none relevant). */
export function recallAtK(hits: RankedResult[], relevant: ReadonlySet<string>, k: number): number {
  const total = relevant.size;
  if (total === 0) return 0;
  const top = hits.slice(0, k);
  const found = top.filter((h) => relevant.has(h.documentId)).length;
  return found / total;
}

/** Reciprocal rank of the first relevant hit (1/rank, 0 if none in top-k). */
export function reciprocalRank(hits: RankedResult[], relevant: ReadonlySet<string>): number {
  for (let i = 0; i < hits.length; i++) {
    if (relevant.has(hits[i]!.documentId)) return 1 / (i + 1);
  }
  return 0;
}

/** DCG@k with binary relevance: Σ rel_i / log2(i+1), 1-indexed ranks. */
export function dcgAtK(hits: RankedResult[], relevant: ReadonlySet<string>, k: number): number {
  let score = 0;
  for (let i = 0; i < Math.min(hits.length, k); i++) {
    if (relevant.has(hits[i]!.documentId)) {
      score += 1 / Math.log2(i + 2);
    }
  }
  return score;
}

/** NDCG@k — DCG normalized by the ideal ordering of the gold set. */
export function ndcgAtK(hits: RankedResult[], relevant: ReadonlySet<string>, k: number): number {
  const total = relevant.size;
  if (total === 0) return 0;
  const dcg = dcgAtK(hits, relevant, k);
  let idcg = 0;
  for (let i = 0; i < Math.min(total, k); i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg === 0 ? 0 : dcg / idcg;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
