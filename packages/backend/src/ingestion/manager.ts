import type { SourceType } from "@curate-ai/shared";
import { loadSourcesConfig, type SourcesConfig } from "./sources.js";
import { fetchArxiv } from "./arxiv.js";
import { fetchRssFeed } from "./rss.js";
import { fetchSubreddit } from "./reddit.js";
import { normalizeUrl, type RawItem } from "./types.js";

export interface IngestOptions {
  sources?: SourceType[];
  arxivMaxResults?: number;
  arxivDaysBack?: number;
  sourcesConfigPath?: string;
}

export interface FetchSummary {
  source: SourceType;
  fetched: number;
  errors: string[];
}

/** Fetch raw items from all configured live sources concurrently (fail-soft). */
export async function fetchLiveSources(
  options: IngestOptions = {},
  fetcher: typeof fetch = fetch,
): Promise<{ items: RawItem[]; summaries: FetchSummary[] }> {
  const config = loadSourcesConfig(options.sourcesConfigPath);
  const enabled = options.sources ?? ["arxiv", "rss", "reddit"];
  const tasks: Array<{ source: SourceType; run: () => Promise<{ items: RawItem[]; error?: string }> }> = [];

  if (enabled.includes("arxiv")) {
    tasks.push({
      source: "arxiv",
      run: () =>
        fetchArxiv(
          config.arxiv,
          options.arxivMaxResults ?? config.arxiv.maxResults,
          options.arxivDaysBack ?? config.arxiv.daysLookback,
          fetcher,
        ),
    });
  }
  if (enabled.includes("rss")) {
    for (const feed of config.rssFeeds.slice(0, 15)) {
      tasks.push({
        source: "rss",
        run: () => fetchRssFeed(feed.url, feed.name, feed.category, fetcher),
      });
    }
  }
  if (enabled.includes("reddit")) {
    for (const sub of config.subreddits) {
      tasks.push({
        source: "reddit",
        run: () => fetchSubreddit(sub.subreddit, sub.name, sub.sort, sub.limit, fetcher),
      });
    }
  }

  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const items: RawItem[] = [];
  const summaries = new Map<SourceType, FetchSummary>();
  const seen = new Set<string>();

  settled.forEach((result, i) => {
    const { source } = tasks[i]!;
    const summary = summaries.get(source) ?? { source, fetched: 0, errors: [] };
    if (result.status === "rejected") {
      summary.errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    } else {
      const { items: srcItems, error } = result.value;
      if (error) summary.errors.push(error);
      for (const item of srcItems) {
        const key = normalizeUrl(item.url);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push(item);
        summary.fetched += 1;
      }
    }
    summaries.set(source, summary);
  });

  return { items, summaries: [...summaries.values()] };
}
