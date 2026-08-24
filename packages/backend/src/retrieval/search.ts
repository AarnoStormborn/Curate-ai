import type Database from "better-sqlite3";
import type { SearchMode, SearchRequest, SearchResponse, SearchResult, ScoreBreakdown } from "@curate-ai/shared";
import type { Embedder } from "../embeddings/types.js";
import { bm25Search } from "./bm25.js";
import { vectorSearch } from "./vector.js";
import { rrfFuse } from "./hybrid.js";
import { getChunkById } from "../db/repo.js";

const SNIPPET_CHARS = 280;

interface Candidate {
  documentId: string;
  rrf: number;
  bm25?: number;
  vector?: number;
  from: Array<"bm25" | "vector">;
  chunkId?: number;
}

export interface SearchService {
  search(req: Partial<SearchRequest> & { q: string }): Promise<SearchResponse>;
}

export function createSearchService(db: Database.Database, embedder: Embedder): SearchService {
  const docById = new Map<string, Record<string, unknown>>();
  const loadDocs = (ids: string[]): void => {
    const fresh = ids.filter((id) => !docById.has(id));
    if (fresh.length === 0) return;
    const placeholders = fresh.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT * FROM documents WHERE id IN (${placeholders})`)
      .all(...fresh) as Array<Record<string, unknown>>;
    for (const row of rows) docById.set(row.id as string, row);
  };

  function buildSnippet(docId: string, chunkId?: number, bm25Content?: string): { snippet?: string; chunkId?: number } {
    if (chunkId) {
      const chunk = getChunkById(db, chunkId);
      if (chunk) {
        return { snippet: truncate(chunk.content, SNIPPET_CHARS), chunkId: chunk.id };
      }
    }
    const doc = docById.get(docId) as Record<string, unknown> | undefined;
    const content = (doc?.summary as string) ?? bm25Content ?? "";
    if (!content) return {};
    return { snippet: truncate(content, SNIPPET_CHARS) };
  }

  return {
    async search(req: SearchRequest): Promise<SearchResponse> {
      const t0 = performance.now();
      const mode: SearchMode = req.mode ?? (req.hybrid === false ? "bm25" : "hybrid");
      const limit = req.limit ?? 10;
      const includeSnippet = req.includeSnippet ?? true;

      // 1. Run the requested retrieval technique(s) in parallel.
      const [bm25Hits, queryEmbedding] = await Promise.all([
        mode !== "vector" ? Promise.resolve(bm25Search(db, req.q, limit * 4)) : Promise.resolve([] as Awaited<ReturnType<typeof bm25Search>>),
        mode !== "bm25" ? embedder.embed([req.q]).then((rows) => rows[0]) : Promise.resolve(undefined),
      ]);
      const vecHits = mode !== "bm25" && queryEmbedding ? vectorSearch(db, queryEmbedding, limit * 4) : [];

      // 2. Roll vector chunk hits up to documents (best distance per doc).
      const bestVec = new Map<string, { distance: number; chunkId: number }>();
      for (const hit of vecHits) {
        const prev = bestVec.get(hit.documentId);
        if (!prev || hit.distance < prev.distance) {
          bestVec.set(hit.documentId, { distance: hit.distance, chunkId: hit.chunkId });
        }
      }
      const vecRanked = [...bestVec.entries()]
        .sort((a, b) => a[1].distance - b[1].distance)
        .map(([id]) => ({ id }));

      // 3. Fuse ranked lists with RRF (single-list fusion = rank-only ordering).
      const lists: Array<Array<{ id: string }>> = [];
      if (mode !== "vector") lists.push(bm25Hits.map((h) => ({ id: h.documentId })));
      if (mode !== "bm25") lists.push(vecRanked);
      const fused = rrfFuse(lists);

      const bm25Scores = new Map(bm25Hits.map((h) => [h.documentId, h.score] as const));
      const bm25Content = new Map(bm25Hits.map((h) => [h.documentId, h.content] as const));

      const candidates: Candidate[] = [...fused.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([documentId, rrf]) => {
          const vec = bestVec.get(documentId);
          const bm25 = bm25Scores.get(documentId);
          const c: Candidate = {
            documentId,
            rrf,
            from: [],
          };
          if (bm25 !== undefined) {
            c.bm25 = bm25;
            c.from.push("bm25");
          }
          if (vec) {
            c.vector = 1 - vec.distance;
            c.chunkId = vec.chunkId;
            c.from.push("vector");
          }
          return c;
        });

      // 4. Load docs, apply filters, cap.
      loadDocs(candidates.map((c) => c.documentId));
      const sourceType = req.sourceType;
      const filtered = candidates.filter((c) => {
        const doc = docById.get(c.documentId) as Record<string, unknown> | undefined;
        if (!doc) return false;
        if (sourceType && doc.source_type !== sourceType) return false;
        const pub = doc.published_at as string | null | undefined;
        if (req.from && pub && pub < req.from) return false;
        if (req.to && pub && pub > req.to) return false;
        return true;
      });

      const selected = filtered.slice(0, limit);

      // 5. Assemble results.
      const results: SearchResult[] = selected.map((c) => {
        const doc = docById.get(c.documentId) as Record<string, unknown> | undefined;
        const { snippet, chunkId } = buildSnippet(c.documentId, c.chunkId, bm25Content.get(c.documentId));
        const score: ScoreBreakdown = {
          rrf: c.rrf,
          ...(c.bm25 !== undefined ? { bm25: c.bm25 } : {}),
          ...(c.vector !== undefined ? { vector: c.vector } : {}),
          from: c.from,
        };
        return {
          documentId: c.documentId,
          ...(chunkId !== undefined ? { chunkId } : {}),
          title: (doc?.title as string) ?? "Untitled",
          url: (doc?.url as string | null | undefined) ?? null,
          source: (doc?.source as string) ?? "unknown",
          sourceType: (doc?.source_type as SearchResult["sourceType"]) ?? "seed",
          ...(includeSnippet && snippet ? { snippet } : {}),
          score,
          tags: (doc?.tags ? JSON.parse(doc.tags as string) : []) as string[],
          publishedAt: (doc?.published_at as string | null | undefined) ?? null,
        };
      });

      return {
        query: req.q,
        results,
        meta: {
          tookMs: Math.round(performance.now() - t0),
          candidates: filtered.length,
          from: { bm25: bm25Hits.length, vector: vecHits.length },
          mode,
        },
      };
    },
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
