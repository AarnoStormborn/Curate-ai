import type { FastifyInstance } from "fastify";
import { DocumentInput } from "@curate-ai/shared";
import type Database from "better-sqlite3";
import type { Embedder } from "../embeddings/types.js";
import { ZodValidationError } from "../app.js";
import { indexDocument } from "../retrieval/indexer.js";
import { deleteDocument, getDocumentById, getDocumentChunks, listDocuments } from "../db/repo.js";

interface DocumentOptions {
  db: Database.Database;
  embedder: Embedder;
}

export function documentRoutes(app: FastifyInstance, opts: DocumentOptions): void {
  app.get("/api/documents", async (req) => {
    const q = req.query as Record<string, unknown>;
    const limit = Math.min(Number(q.limit ?? 50) || 50, 200);
    const offset = Math.max(Number(q.offset ?? 0) || 0, 0);
    return { documents: listDocuments(opts.db, limit, offset) };
  });

  app.get("/api/documents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = getDocumentById(opts.db, id);
    if (!doc) {
      void reply.code(404).send({ error: "not_found" });
      return;
    }
    return { document: doc, chunks: getDocumentChunks(opts.db, id) };
  });

  app.post("/api/documents", async (req, reply) => {
    const parsed = DocumentInput.safeParse(req.body);
    if (!parsed.success) throw new ZodValidationError(parsed.error.flatten());
    const result = await indexDocument(opts.db, opts.embedder, parsed.data);
    if (result.skipped) {
      void reply.code(409).send({ error: "duplicate_url", documentId: result.documentId });
      return;
    }
    void reply.code(201);
    return { documentId: result.documentId, chunkCount: result.chunkCount };
  });

  app.delete("/api/documents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = deleteDocument(opts.db, id);
    if (!ok) {
      void reply.code(404).send({ error: "not_found" });
      return;
    }
    void reply.code(204);
    return;
  });
}
