/**
 * Reciprocal Rank Fusion (RRF) — the hybrid-search fusion used by Lucene/Elastic
 * and standard in modern RAG stacks.
 *
 * Each retrieval technique produces a ranked list of document ids. RRF combines
 * them by summing `1 / (k + rank)` over all lists, so documents ranked highly by
 * *multiple* techniques win — no score normalization required.
 */
export function rrfFuse(lists: Array<Array<{ id: string }>>, k = 60): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      fused.set(item.id, (fused.get(item.id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return fused;
}

/** Simple deterministic fusion for a single list (used when hybrid is off). */
export function rankOnly(list: Array<{ id: string }>): Map<string, number> {
  const out = new Map<string, number>();
  list.forEach((item, rank) => out.set(item.id, 1 / (rank + 1)));
  return out;
}
