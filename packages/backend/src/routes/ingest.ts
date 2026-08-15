import type { FastifyInstance } from "fastify";
import { IngestRequest } from "@curate-ai/shared";
import type { IngestService } from "../services/ingest.js";
import { ZodValidationError } from "../app.js";

interface IngestOptions {
  ingest: IngestService;
}

export function ingestRoutes(app: FastifyInstance, opts: IngestOptions): void {
  app.post("/api/ingest", async (req, reply) => {
    const parsed = IngestRequest.safeParse(req.body ?? {});
    if (!parsed.success) throw new ZodValidationError(parsed.error.flatten());
    const result = await opts.ingest.ingest(parsed.data);
    void reply.code(202);
    return result;
  });
}
