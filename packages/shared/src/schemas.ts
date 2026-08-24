import { z } from "zod";

// ============================================================================
// Domain model — ported from the legacy Python/Pydantic design (docs/legacy.md)
// ============================================================================

/** Type of the source that produced a document. */
export const SourceType = z.enum(["arxiv", "rss", "reddit", "seed", "manual"]);
export type SourceType = z.infer<typeof SourceType>;

/** A single ingested, searchable document. */
export const Document = z.object({
  id: z.string(),
  title: z.string().min(1),
  url: z.string().url().nullable().optional(),
  source: z.string().min(1),
  sourceType: SourceType,
  summary: z.string().nullable().optional(),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  publishedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type Document = z.infer<typeof Document>;

/** Payload used to create a document (id/createdAt are generated server-side). */
export const DocumentInput = Document.omit({ id: true, createdAt: true });
export type DocumentInput = z.infer<typeof DocumentInput>;

/** A chunk of a document that carries its own embedding. */
export const Chunk = z.object({
  id: z.number(),
  documentId: z.string(),
  chunkIndex: z.number(),
  content: z.string(),
});
export type Chunk = z.infer<typeof Chunk>;

// ============================================================================
// Search API
// ============================================================================

/** Retrieval mode — used by the eval harness to compare techniques. */
export const SearchMode = z.enum(["hybrid", "bm25", "vector"]);
export type SearchMode = z.infer<typeof SearchMode>;

export const SearchRequest = z.object({
  q: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).default(10),
  /** Combine BM25 + vector results via reciprocal rank fusion. */
  hybrid: z.boolean().default(true),
  /** Override hybrid: explicit retrieval mode (evaluator uses this). */
  mode: SearchMode.optional(),
  sourceType: SourceType.optional(),
  /** Inclusive ISO date filter on publishedAt. */
  from: z.string().optional(),
  to: z.string().optional(),
  /** Include the best-matching chunk snippet. */
  includeSnippet: z.boolean().default(true),
});
export type SearchRequest = z.infer<typeof SearchRequest>;

/** Per-result retrieval scores (undefined = technique didn't rank this doc). */
export const ScoreBreakdown = z.object({
  rrf: z.number(),
  bm25: z.number().optional(),
  vector: z.number().optional(),
  /** Techniques that surfaced this result. */
  from: z.array(z.enum(["bm25", "vector"])),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;

export const SearchResult = z.object({
  documentId: z.string(),
  chunkId: z.number().optional(),
  title: z.string(),
  url: z.string().nullable().optional(),
  source: z.string(),
  sourceType: SourceType,
  snippet: z.string().optional(),
  score: ScoreBreakdown,
  tags: z.array(z.string()).default([]),
  publishedAt: z.string().nullable().optional(),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const SearchResponse = z.object({
  query: z.string(),
  results: z.array(SearchResult),
  meta: z.object({
    tookMs: z.number(),
    candidates: z.number(),
    from: z.object({ bm25: z.number(), vector: z.number() }),
    mode: SearchMode,
  }),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

// ============================================================================
// Stats / ingest
// ============================================================================

export const Stats = z.object({
  documents: z.number(),
  chunks: z.number(),
  sources: z.record(SourceType, z.number()),
  embeddingModel: z.string(),
  embeddingDim: z.number(),
  lastIngest: z.string().nullable(),
});
export type Stats = z.infer<typeof Stats>;

export const IngestRequest = z.object({
  /** "seed" loads the bundled corpus; "live" fetches configured sources. */
  mode: z.enum(["seed", "live"]).default("seed"),
  sources: z.array(SourceType).optional(),
});
export type IngestRequest = z.infer<typeof IngestRequest>;

export const IngestRun = z.object({
  id: z.string(),
  source: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  itemsFetched: z.number(),
  itemsIndexed: z.number(),
  durationMs: z.number(),
  error: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type IngestRun = z.infer<typeof IngestRun>;
