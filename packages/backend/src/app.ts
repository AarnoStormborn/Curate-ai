import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type Database from "better-sqlite3";
import type { Config } from "./config.js";
import type { Embedder } from "./embeddings/types.js";
import type { SearchService } from "./retrieval/search.js";
import type { IngestService } from "./services/ingest.js";
import { healthRoutes } from "./routes/health.js";
import { statsRoutes } from "./routes/stats.js";
import { searchRoutes } from "./routes/search.js";
import { documentRoutes } from "./routes/documents.js";
import { ingestRoutes } from "./routes/ingest.js";

export interface AppDeps {
  db: Database.Database;
  embedder: Embedder;
  search: SearchService;
  ingest: IngestService;
  config: Config;
  logger?: boolean;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? { level: deps.config.LOG_LEVEL },
  });

  void app.register(cors, {
    origin: deps.config.FRONTEND_ORIGIN.split(",").map((s) => s.trim()),
  });

  void app.register(healthRoutes);
  void app.register(statsRoutes, { db: deps.db, embedder: deps.embedder });
  void app.register(searchRoutes, { search: deps.search });
  void app.register(documentRoutes, { db: deps.db, embedder: deps.embedder });
  void app.register(ingestRoutes, { ingest: deps.ingest });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodValidationError) {
      void reply.code(400).send({ error: "validation_error", details: err.details });
      return;
    }
    app.log.error(err, "unhandled error");
    void reply.code(500).send({ error: "internal_error" });
  });

  return app;
}

/** Internal wrapper so route handlers can return 400s for schema failures. */
export class ZodValidationError extends Error {
  constructor(public details: unknown) {
    super("validation_error");
  }
}
