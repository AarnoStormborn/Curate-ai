import type Database from "better-sqlite3";

export interface Bm25Hit {
  rowid: number;
  documentId: string;
  title: string;
  content: string;
  tags: string[];
  /** BM25 score (higher = better; negated from FTS5's negative ranking). */
  score: number;
}

/**
 * Convert a user query into a safe FTS5 MATCH expression.
 * Each token becomes a quoted phrase; tokens are implicitly AND-ed.
 * Returns null for an empty query.
 */
export function toFtsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

/** BM25 keyword search over the FTS5 index (documents level). */
export function bm25Search(
  db: Database.Database,
  q: string,
  limit: number,
): Bm25Hit[] {
  const query = toFtsQuery(q);
  if (!query) return [];
  const rows = db
    .prepare(
      `SELECT documents_fts.rowid, d.id AS document_id, d.title, d.content, d.tags,
              -bm25(documents_fts) AS score
       FROM documents_fts
       JOIN documents d ON d.rowid = documents_fts.rowid
       WHERE documents_fts MATCH ?
       ORDER BY score DESC
       LIMIT ?`,
    )
    .all(query, limit) as Array<{
    rowid: number;
    document_id: string;
    title: string;
    content: string;
    tags: string;
    score: number;
  }>;
  return rows.map((r) => ({
    rowid: r.rowid,
    documentId: r.document_id,
    title: r.title,
    content: r.content,
    tags: JSON.parse(r.tags) as string[],
    score: r.score,
  }));
}
