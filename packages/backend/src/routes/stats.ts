import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import type { Embedder } from "../embeddings/types.js";
import { countChunks, countDocuments, lastIngestAt, sourceCounts } from "../db/repo.js";

interface StatsOptions {
  db: Database.Database;
  embedder: Embedder;
}

export function statsRoutes(app: FastifyInstance, opts: StatsOptions): void {
  app.get("/api/stats", async () => ({
    documents: countDocuments(opts.db),
    chunks: countChunks(opts.db),
    sources: sourceCounts(opts.db),
    embeddingModel: opts.embedder.model,
    embeddingDim: opts.embedder.dim,
    lastIngest: lastIngestAt(opts.db),
  }));
}
