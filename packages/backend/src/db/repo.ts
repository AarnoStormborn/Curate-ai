import type Database from "better-sqlite3";
import type { Document, DocumentInput, IngestRun } from "@curate-ai/shared";
import { randomUUID } from "node:crypto";

// ============================================================================
// Documents
// ============================================================================

export interface DocumentRow {
  id: string;
  title: string;
  url: string | null;
  source: string;
  source_type: string;
  summary: string | null;
  content: string;
  tags: string;
  metadata: string;
  published_at: string | null;
  created_at: string;
}

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    source: row.source,
    sourceType: row.source_type as Document["sourceType"],
    summary: row.summary,
    content: row.content,
    tags: JSON.parse(row.tags) as string[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

export function insertDocument(db: Database.Database, input: DocumentInput): { id: string; rowid: number } {
  const id = randomUUID();
  const info = db
    .prepare(
      `INSERT INTO documents (id, title, url, source, source_type, summary, content, tags, metadata, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title,
      input.url ?? null,
      input.source,
      input.sourceType,
      input.summary ?? null,
      input.content,
      JSON.stringify(input.tags),
      JSON.stringify(input.metadata),
      input.publishedAt ?? null,
    );
  return { id, rowid: Number(info.lastInsertRowid) };
}

export function getDocumentById(db: Database.Database, id: string): Document | null {
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;
  return row ? rowToDocument(row) : null;
}

export function getDocumentByUrl(db: Database.Database, url: string): Document | null {
  const row = db.prepare("SELECT * FROM documents WHERE url = ?").get(url) as DocumentRow | undefined;
  return row ? rowToDocument(row) : null;
}

export function listDocuments(db: Database.Database, limit: number, offset: number): Document[] {
  const rows = db
    .prepare("SELECT * FROM documents ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as DocumentRow[];
  return rows.map(rowToDocument);
}

export function deleteDocument(db: Database.Database, id: string): boolean {
  const doc = db.prepare("SELECT rowid FROM documents WHERE id = ?").get(id) as
    | { rowid: number }
    | undefined;
  if (!doc) return false;

  // Remove from both indexes first (FTS rowid = documents rowid; vec rowid = chunk id).
  const chunkIds = (
    db.prepare("SELECT id FROM document_chunks WHERE document_id = ?").all(id) as Array<{ id: number }>
  ).map((c) => c.id);
  const delVec = db.prepare("DELETE FROM chunks_vec WHERE rowid = ?");
  const tx = db.transaction(() => {
    for (const cid of chunkIds) delVec.run(BigInt(cid));
    db.prepare("DELETE FROM documents_fts WHERE rowid = ?").run(doc.rowid);
    db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  });
  tx();
  return true;
}

// ============================================================================
// Chunks + vector index
// ============================================================================

export function insertChunks(
  db: Database.Database,
  documentId: string,
  chunks: Array<{ index: number; content: string }>,
): number[] {
  const stmt = db.prepare(
    "INSERT INTO document_chunks (document_id, chunk_index, content) VALUES (?, ?, ?)",
  );
  const tx = db.transaction(() => chunks.map((c) => Number(stmt.run(documentId, c.index, c.content).lastInsertRowid)));
  return tx();
}

export function insertVectorRows(
  db: Database.Database,
  rows: Array<{ rowid: number; embedding: Float32Array }>,
): void {
  const stmt = db.prepare("INSERT INTO chunks_vec (rowid, embedding) VALUES (?, ?)");
  const tx = db.transaction(() => {
    // sqlite-vec requires integer rowids; better-sqlite3 binds JS numbers as REAL,
    // so pass BigInt explicitly.
    for (const r of rows) stmt.run(BigInt(r.rowid), r.embedding);
  });
  tx();
}

export function insertFtsRow(
  db: Database.Database,
  rowid: number,
  title: string,
  content: string,
  tags: string[],
): void {
  db.prepare("INSERT INTO documents_fts (rowid, title, content, tags) VALUES (?, ?, ?, ?)").run(
    rowid,
    title,
    content,
    tags.join(" "),
  );
}

export function getChunkById(db: Database.Database, id: number): { id: number; documentId: string; chunkIndex: number; content: string } | null {
  const row = db.prepare("SELECT id, document_id, chunk_index, content FROM document_chunks WHERE id = ?").get(id) as
    | { id: number; document_id: string; chunk_index: number; content: string }
    | undefined;
  return row
    ? { id: row.id, documentId: row.document_id, chunkIndex: row.chunk_index, content: row.content }
    : null;
}

export function getDocumentChunks(db: Database.Database, documentId: string): Array<{ id: number; chunkIndex: number; content: string }> {
  const rows = db
    .prepare("SELECT id, chunk_index, content FROM document_chunks WHERE document_id = ? ORDER BY chunk_index")
    .all(documentId) as Array<{ id: number; chunk_index: number; content: string }>;
  return rows.map((r) => ({ id: r.id, chunkIndex: r.chunk_index, content: r.content }));
}

// ============================================================================
// Stats
// ============================================================================

export function countDocuments(db: Database.Database): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n;
}

export function countChunks(db: Database.Database): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM document_chunks").get() as { n: number }).n;
}

export function sourceCounts(db: Database.Database): Record<string, number> {
  const rows = db
    .prepare("SELECT source_type, COUNT(*) AS n FROM documents GROUP BY source_type")
    .all() as Array<{ source_type: string; n: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.source_type] = r.n;
  return out;
}

export function lastIngestAt(db: Database.Database): string | null {
  const row = db
    .prepare("SELECT completed_at FROM ingest_runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1")
    .get() as { completed_at: string | null } | undefined;
  return row?.completed_at ?? null;
}

// ============================================================================
// Ingest runs (audit)
// ============================================================================

export function createIngestRun(db: Database.Database, source: string): IngestRun {
  const id = randomUUID();
  db.prepare("INSERT INTO ingest_runs (id, source, status) VALUES (?, ?, 'running')").run(id, source);
  return {
    id,
    source,
    status: "running",
    itemsFetched: 0,
    itemsIndexed: 0,
    durationMs: 0,
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

export function completeIngestRun(
  db: Database.Database,
  id: string,
  result: { status: "completed" | "failed"; itemsFetched: number; itemsIndexed: number; durationMs: number; error?: string },
): void {
  db.prepare(
    `UPDATE ingest_runs
     SET status = ?, items_fetched = ?, items_indexed = ?, duration_ms = ?, error = ?,
         completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  ).run(result.status, result.itemsFetched, result.itemsIndexed, result.durationMs, result.error ?? null, id);
}

export function getRecentRuns(db: Database.Database, limit = 10): IngestRun[] {
  const rows = db
    .prepare("SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT ?")
    .all(limit) as Array<{
    id: string;
    source: string;
    status: string;
    items_fetched: number;
    items_indexed: number;
    duration_ms: number;
    error: string | null;
    started_at: string;
    completed_at: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    status: r.status as IngestRun["status"],
    itemsFetched: r.items_fetched,
    itemsIndexed: r.items_indexed,
    durationMs: r.duration_ms,
    error: r.error,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  }));
}
