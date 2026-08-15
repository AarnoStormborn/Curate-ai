import type Database from "better-sqlite3";
import type { Document, DocumentInput } from "@curate-ai/shared";
import type { Embedder } from "../embeddings/types.js";
import { chunkText } from "./chunker.js";
import {
  getDocumentByUrl,
  insertChunks,
  insertDocument,
  insertFtsRow,
  insertVectorRows,
} from "../db/repo.js";

export interface IndexResult {
  documentId: string;
  chunkCount: number;
  skipped: boolean;
}

/** Insert a single document: store + chunk + embed + populate both indexes. */
export async function indexDocument(
  db: Database.Database,
  embedder: Embedder,
  input: DocumentInput,
): Promise<IndexResult> {
  if (input.url) {
    const existing = getDocumentByUrl(db, input.url);
    if (existing) return { documentId: existing.id, chunkCount: 0, skipped: true };
  }

  const { id, rowid } = insertDocument(db, input);
  const chunks = chunkText(input.content).map((content, index) => ({ index, content }));
  const chunkIds = insertChunks(db, id, chunks);
  const embeddings = await embedder.embed(chunks.map((c) => c.content));
  insertVectorRows(
    db,
    chunkIds.map((rowid, i) => ({ rowid, embedding: embeddings[i]! })),
  );
  insertFtsRow(db, rowid, input.title, input.content, input.tags);
  return { documentId: id, chunkCount: chunks.length, skipped: false };
}

export interface IndexManyResult {
  indexed: number;
  skipped: number;
  chunks: number;
}

export async function indexDocuments(
  db: Database.Database,
  embedder: Embedder,
  inputs: DocumentInput[],
): Promise<IndexManyResult> {
  const out: IndexManyResult = { indexed: 0, skipped: 0, chunks: 0 };
  for (const input of inputs) {
    const r = await indexDocument(db, embedder, input);
    if (r.skipped) out.skipped += 1;
    else {
      out.indexed += 1;
      out.chunks += r.chunkCount;
    }
  }
  return out;
}

/** Reindex an existing document (deletes old chunks + vectors, rebuilds). */
export async function reindexDocument(
  db: Database.Database,
  embedder: Embedder,
  doc: Document,
): Promise<number> {
  const chunks = chunkText(doc.content).map((content, index) => ({ index, content }));
  const chunkIds = insertChunks(db, doc.id, chunks);
  const embeddings = await embedder.embed(chunks.map((c) => c.content));
  insertVectorRows(
    db,
    chunkIds.map((rowid, i) => ({ rowid, embedding: embeddings[i]! })),
  );
  return chunks.length;
}
