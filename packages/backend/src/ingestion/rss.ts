import Parser from "rss-parser";
import type { RawItem } from "./types.js";

const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Fetch a single RSS/Atom feed and map items to RawItems. */
export async function fetchRssFeed(
  url: string,
  sourceName: string,
  category: string,
  fetcher: (url: string) => Promise<Response> = fetch,
): Promise<{ items: RawItem[]; error?: string }> {
  try {
    const parser = new Parser({
      timeout: 30_000,
      headers: { "User-Agent": "CurateAI/0.2 (research curation)" },
      customFields: { item: [["content:encoded", "contentEncoded"]] },
    });
    // rss-parser's parseURL uses its own http client; route through fetcher for testability.
    const res = await fetcher(url);
    if (!res.ok) return { items: [], error: `RSS HTTP ${res.status} for ${sourceName}` };
    const feed = await parser.parseString(await res.text());

    const items: RawItem[] = [];
    for (const item of feed.items ?? []) {
      const title = (item.title ?? "Untitled").trim();
      const link = item.link ?? "";
      if (!link) continue;
      const content =
        stripHtml(item.contentEncoded ?? item.content ?? "") ||
        stripHtml(item.contentSnippet ?? item.summary ?? "");
      const published =
        item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : undefined);
      items.push({
        title,
        url: link,
        source: sourceName,
        sourceType: "rss",
        summary: content.slice(0, 500),
        content: content.slice(0, 4000) || title,
        publishedAt: published,
        tags: (item.categories ?? []).map(String),
        metadata: { feed: url, category },
      });
    }
    return { items };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
