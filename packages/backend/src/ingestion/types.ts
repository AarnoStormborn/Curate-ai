import type { DocumentInput, SourceType } from "@curate-ai/shared";

/** A raw item from an ingestion source, before dedup/indexing. */
export interface RawItem {
  title: string;
  url: string;
  source: string;
  sourceType: SourceType;
  summary?: string;
  content?: string;
  publishedAt?: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

/** Convert a raw item to a document input, guaranteeing non-empty content. */
export function toDocumentInput(item: RawItem): DocumentInput {
  return {
    title: item.title.trim(),
    url: item.url || undefined,
    source: item.source,
    sourceType: item.sourceType,
    summary: item.summary?.trim() || null,
    content: (item.content ?? item.summary ?? item.title).trim(),
    tags: item.tags,
    metadata: item.metadata,
    publishedAt: item.publishedAt ?? null,
  };
}

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").split("#")[0]!;
}
