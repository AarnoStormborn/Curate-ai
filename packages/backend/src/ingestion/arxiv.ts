import { XMLParser } from "fast-xml-parser";
import type { ArxivConfig } from "./sources.js";
import type { RawItem } from "./types.js";

interface AtomEntry {
  title?: string;
  summary?: string;
  published?: string;
  id?: string;
  author?: unknown;
  link?: unknown;
  category?: unknown;
  "arxiv:primary_category"?: unknown;
  "arxiv:comment"?: unknown;
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as { "#text"?: string };
    if (typeof o["#text"] === "string") return o["#text"];
  }
  return "";
}

function attr(v: unknown, name: string): string | undefined {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const val = o[`@_${name}`];
    if (typeof val === "string") return val;
  }
  return undefined;
}

export interface ArxivFetchResult {
  items: RawItem[];
  error?: string;
}

/** Fetch recent papers from the arXiv Atom API for the configured categories. */
export async function fetchArxiv(
  config: ArxivConfig,
  maxResults = 30,
  daysBack = 7,
  fetcher: typeof fetch = fetch,
): Promise<ArxivFetchResult> {
  if (!config.enabled) return { items: [] };
  try {
    const catQuery = config.categories.map((c) => `cat:${c}`).join(" OR ");
    const params = new URLSearchParams({
      search_query: catQuery,
      sortBy: "submittedDate",
      sortOrder: "descending",
      start: "0",
      max_results: String(Math.min(maxResults, 200)),
    });
    const res = await fetcher(`https://export.arxiv.org/api/query?${params}`, {
      headers: { "User-Agent": "CurateAI/0.2 (research curation)" },
    });
    if (!res.ok) return { items: [], error: `arXiv HTTP ${res.status}` };
    const xml = await res.text();

    const parser = new XMLParser({ ignoreAttributes: false });
    const doc = parser.parse(xml) as { feed?: { entry?: AtomEntry | AtomEntry[] } };
    const entries = toArray<AtomEntry>(doc.feed?.entry);

    const cutoff = Date.now() - daysBack * 86_400_000;
    const items: RawItem[] = [];

    for (const entry of entries) {
      const published = entry.published ?? "";
      const publishedMs = Date.parse(published);
      if (Number.isNaN(publishedMs)) continue;
      if (publishedMs < cutoff) continue;

      const title = str(entry.title).replace(/\s+/g, " ").trim();
      const summary = str(entry.summary).replace(/\s+/g, " ").trim();
      const id = str(entry.id);
      const absUrl = id.replace(/^http:/, "https:");
      const authors = toArray(entry.author)
        .map((a) => str((a as { name?: string })?.name))
        .filter((a): a is string => Boolean(a));
      const links = toArray(entry.link);
      let pdfUrl = absUrl;
      for (const link of links) {
        if (attr(link, "type") === "application/pdf") {
          pdfUrl = attr(link, "href") ?? absUrl;
          break;
        }
      }
      const categories = toArray(entry.category)
        .map((c) => attr(c, "term"))
        .filter((c): c is string => Boolean(c));
      const primary =
        attr(entry["arxiv:primary_category"], "term") ?? categories[0] ?? "";
      const arxivId = absUrl.split("/abs/").pop() ?? "";

      items.push({
        title,
        url: absUrl,
        source: "arXiv",
        sourceType: "arxiv",
        summary,
        content: summary.slice(0, 3000),
        publishedAt: new Date(publishedMs).toISOString(),
        tags: categories,
        metadata: { primaryCategory: primary, pdfUrl, arxivId },
      });
    }

    return { items };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
