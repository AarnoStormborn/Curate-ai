import type Database from "better-sqlite3";
import type { IngestRequest, IngestRun } from "@curate-ai/shared";
import type { Embedder } from "../embeddings/types.js";
import type { FetchSummary } from "../ingestion/manager.js";
import type { Config } from "../config.js";
import { fetchLiveSources } from "../ingestion/manager.js";
import { toDocumentInput } from "../ingestion/types.js";
import { indexDocuments, type IndexManyResult } from "../retrieval/indexer.js";
import { completeIngestRun, createIngestRun } from "../db/repo.js";
import { SEED_DOCUMENTS } from "../seed/corpus.js";

export interface IngestResult {
  run: IngestRun;
  summaries: FetchSummary[];
  indexed: IndexManyResult;
}

export interface IngestService {
  ingest(req: IngestRequest): Promise<IngestResult>;
}

export function createIngestService(db: Database.Database, embedder: Embedder, config?: Config): IngestService {
  return {
    async ingest(req: IngestRequest): Promise<IngestResult> {
      const run = createIngestRun(db, req.mode);
      const t0 = performance.now();
      let itemsFetched = 0;

      try {
        if (req.mode === "seed") {
          const inputs = [...SEED_DOCUMENTS];
          if (req.sources) {
            // Seed mode with explicit sources isn't meaningful — ignore source filter.
          }
          itemsFetched = inputs.length;
          const indexed = await indexDocuments(db, embedder, inputs);
          completeIngestRun(db, run.id, {
            status: "completed",
            itemsFetched,
            itemsIndexed: indexed.indexed,
            durationMs: Math.round(performance.now() - t0),
          });
          return {
            run: { ...run, status: "completed", itemsFetched, itemsIndexed: indexed.indexed, durationMs: Math.round(performance.now() - t0), completedAt: new Date().toISOString() },
            summaries: [{ source: "seed", fetched: itemsFetched, errors: [] }],
            indexed,
          };
        }

        const { items, summaries } = await fetchLiveSources({
          sources: req.sources,
          arxivMaxResults: config?.ARXIV_MAX_RESULTS,
          arxivDaysBack: config?.ARXIV_DAYS_LOOKBACK,
        });
        itemsFetched = items.length;
        const inputs = items.map(toDocumentInput);
        const indexed = await indexDocuments(db, embedder, inputs);
        completeIngestRun(db, run.id, {
          status: "completed",
          itemsFetched,
          itemsIndexed: indexed.indexed,
          durationMs: Math.round(performance.now() - t0),
        });
        return {
          run: { ...run, status: "completed", itemsFetched, itemsIndexed: indexed.indexed, durationMs: Math.round(performance.now() - t0), completedAt: new Date().toISOString() },
          summaries,
          indexed,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        completeIngestRun(db, run.id, {
          status: "failed",
          itemsFetched,
          itemsIndexed: 0,
          durationMs: Math.round(performance.now() - t0),
          error: message,
        });
        throw err;
      }
    },
  };
}
