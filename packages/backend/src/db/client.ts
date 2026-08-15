import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

/**
 * Full schema for the retrieval database.
 *
 * Two retrieval indexes over the same corpus:
 *  - `documents_fts`  — SQLite FTS5 (BM25) keyword search, rowid = documents.rowid
 *  - `chunks_vec`     — sqlite-vec 0-dim cosine ANN, rowid = document_chunks.id
 *
 * Documents are stored once (with metadata) and chunked; each chunk carries an
 * embedding. Hybrid search fuses the two indexes with reciprocal rank fusion.
 */
export function schemaSql(embeddingDim: number): string {
  return `
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  url          TEXT UNIQUE,
  source       TEXT NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN ('arxiv','rss','reddit','seed','manual')),
  summary      TEXT,
  content      TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  metadata     TEXT NOT NULL DEFAULT '{}',
  published_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  UNIQUE (document_id, chunk_index)
);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title, content, tags,
  tokenize = 'porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
  embedding float[${embeddingDim}] distance_metric=cosine
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id             TEXT PRIMARY KEY,
  source         TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  items_fetched  INTEGER NOT NULL DEFAULT 0,
  items_indexed  INTEGER NOT NULL DEFAULT 0,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  error          TEXT,
  started_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);
CREATE INDEX IF NOT EXISTS idx_documents_published_at ON documents(published_at);
`;
}

const MIGRATIONS: Array<{ version: number; sql: (dim: number) => string }> = [
  { version: 1, sql: schemaSql },
];

/** Open (or create) a SQLite database with sqlite-vec + schema applied. */
export function openDb(path: string, embeddingDim = 384): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map(
      (r) => r.version,
    ),
  );
  for (const m of MIGRATIONS) {
    if (!applied.has(m.version)) {
      db.exec(m.sql(embeddingDim));
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(m.version);
    }
  }
  return db;
}
