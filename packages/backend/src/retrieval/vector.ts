import type Database from "better-sqlite3";

export interface VectorHit {
  chunkId: number;
  documentId: string;
  /** Cosine distance (0 = identical). */
  distance: number;
}

/**
 * ANN vector search over chunk embeddings (sqlite-vec cosine).
 * Returns top-k chunks; callers roll chunks up to documents.
 */
export function vectorSearch(
  db: Database.Database,
  embedding: Float32Array,
  limit: number,
): VectorHit[] {
  const rows = db
    .prepare(
      `SELECT v.rowid AS chunk_id, d.id AS document_id, v.distance
       FROM chunks_vec v
       JOIN document_chunks c ON c.id = v.rowid
       JOIN documents d ON d.id = c.document_id
       WHERE v.embedding MATCH ?
         AND k = ?
       ORDER BY v.distance ASC`,
    )
    .all(embedding, limit) as Array<{ chunk_id: number; document_id: string; distance: number }>;
  return rows.map((r) => ({ chunkId: r.chunk_id, documentId: r.document_id, distance: r.distance }));
}
