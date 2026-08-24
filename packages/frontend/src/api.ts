import type { SearchResponse, Stats } from "@curate-ai/shared";
import { SearchResponse as SearchResponseSchema, Stats as StatsSchema } from "@curate-ai/shared";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export interface SearchOptions {
  hybrid: boolean;
  mode?: string;
  sourceType?: string;
  limit?: number;
}

export async function search(q: string, opts: SearchOptions): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q,
    hybrid: String(opts.hybrid),
    limit: String(opts.limit ?? 10),
  });
  if (opts.mode) params.set("mode", opts.mode);
  if (opts.sourceType) params.set("sourceType", opts.sourceType);

  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `search failed (${res.status})`);
  }
  return SearchResponseSchema.parse(await res.json());
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error(`stats failed (${res.status})`);
  return StatsSchema.parse(await res.json());
}

export async function triggerIngest(mode: "seed" | "live"): Promise<void> {
  const res = await fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error(`ingest failed (${res.status})`);
}
