import type { SearchMode, SearchResponse } from "@curate-ai/shared";
import type { SearchService } from "./search.js";
import { mean, ndcgAtK, recallAtK, reciprocalRank } from "./metrics.js";

/** A gold query: the query text plus URLs of documents that are relevant. */
export interface GoldQuery {
  query: string;
  /** URLs of relevant documents (resolved to ids against the current index). */
  relevantUrls: string[];
}

export const EVAL_MODES: SearchMode[] = ["hybrid", "bm25", "vector"];

export interface QueryEval {
  query: string;
  mode: SearchMode;
  k: number;
  hitIds: string[];
  relevantFound: string[];
  missedRelevant: string[];
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
}

export interface EvalResult {
  mode: SearchMode;
  k: number;
  queries: QueryEval[];
  aggregate: {
    recallAtK: number;
    mrr: number;
    ndcgAtK: number;
    queriesEvaluated: number;
    queriesWithRelevant: number;
    skippedUnresolved: number;
  };
}

export interface EvaluateOptions {
  k?: number;
  /** Resolve a gold-set URL to an indexed document id (null if not indexed). */
  resolveUrl: (url: string) => string | null;
  /** Skip queries whose relevant docs are not in the index (default: true). */
  skipUnresolved?: boolean;
}

/**
 * Run a gold set through the search service for a single mode and aggregate
 * recall@k / MRR / NDCG@k. Every query becomes a real search, so results are
 * comparable across modes and index versions.
 */
export async function evaluate(
  search: SearchService,
  goldSet: GoldQuery[],
  mode: SearchMode,
  options: EvaluateOptions,
): Promise<EvalResult> {
  const k = options.k ?? 10;
  const skipUnresolved = options.skipUnresolved ?? true;

  const queries: QueryEval[] = [];
  let skipped = 0;

  for (const gq of goldSet) {
    const relevantIds: string[] = [];
    for (const url of gq.relevantUrls) {
      const id = options.resolveUrl(url);
      if (id) relevantIds.push(id);
    }
    if (relevantIds.length === 0) {
      if (skipUnresolved) {
        skipped += 1;
        continue;
      }
      relevantIds.push("__unresolved__");
    }
    const relevant = new Set(relevantIds);

    const response: SearchResponse = await search.search({ q: gq.query, limit: k, mode });
    const hits = response.results.map((r) => ({ documentId: r.documentId }));
    const hitIds = hits.map((h) => h.documentId);

    queries.push({
      query: gq.query,
      mode,
      k,
      hitIds,
      relevantFound: hits.filter((h) => relevant.has(h.documentId)).map((h) => h.documentId),
      missedRelevant: [...relevantIds.filter((id) => !hitIds.includes(id))],
      recallAtK: recallAtK(hits, relevant, k),
      mrr: reciprocalRank(hits, relevant),
      ndcgAtK: ndcgAtK(hits, relevant, k),
    });
  }

  return {
    mode,
    k,
    queries,
    aggregate: {
      recallAtK: mean(queries.map((q) => q.recallAtK)),
      mrr: mean(queries.map((q) => q.mrr)),
      ndcgAtK: mean(queries.map((q) => q.ndcgAtK)),
      queriesEvaluated: queries.length,
      queriesWithRelevant: queries.filter((q) => q.relevantFound.length > 0).length,
      skippedUnresolved: skipped,
    },
  };
}

/** Pretty-print an aggregate comparison table across modes. */
export function formatEvalTable(results: EvalResult[]): string {
  const header = `mode     recall@k  mrr      ndcg@k   queries`;
  const rows = results.map((r) => {
    const a = r.aggregate;
    return `${r.mode.padEnd(8)} ${a.recallAtK.toFixed(3).padStart(8)}  ${a.mrr.toFixed(3).padStart(7)}  ${a.ndcgAtK.toFixed(3).padStart(7)}  ${a.queriesEvaluated}`;
  });
  return [header, ...rows].join("\n");
}
