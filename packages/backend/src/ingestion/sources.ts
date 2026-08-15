import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export interface RssFeedConfig {
  name: string;
  url: string;
  category: string;
}

export interface SubredditConfig {
  name: string;
  subreddit: string;
  sort: string;
  limit: number;
}

export interface ArxivConfig {
  enabled: boolean;
  categories: string[];
  maxResults: number;
  daysLookback: number;
}

export interface SourcesConfig {
  rssFeeds: RssFeedConfig[];
  subreddits: SubredditConfig[];
  arxiv: ArxivConfig;
  settings: Record<string, unknown>;
}

/** Resolve `config/sources.yml` by walking up from the module (works in src/, dist/, docker). */
export function defaultSourcesPath(): string {
  const envPath = process.env.SOURCES_CONFIG;
  if (envPath) return envPath;
  let dir = fileURLToPath(new URL(".", import.meta.url));
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "config", "sources.yml");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "config/sources.yml not found; set SOURCES_CONFIG to its absolute path",
  );
}

export function loadSourcesConfig(path?: string): SourcesConfig {
  const file = path ?? process.env.SOURCES_CONFIG ?? defaultSourcesPath();
  const raw = readFileSync(file, "utf8");
  const data = parseYaml(raw) as {
    rss_feeds?: Array<{ name?: string; url?: string; category?: string }>;
    subreddits?: Array<{ name?: string; subreddit?: string; sort?: string; limit?: number }>;
    arxiv?: { enabled?: boolean; categories?: string[]; max_results?: number; days_lookback?: number };
    settings?: Record<string, unknown>;
  };

  return {
    rssFeeds: (data.rss_feeds ?? []).map((f) => ({
      name: f.name ?? "Unknown",
      url: f.url ?? "",
      category: f.category ?? "news",
    })),
    subreddits: (data.subreddits ?? []).map((s) => ({
      name: s.name ?? `r/${s.subreddit}`,
      subreddit: s.subreddit ?? "",
      sort: s.sort ?? "hot",
      limit: s.limit ?? 25,
    })),
    arxiv: {
      enabled: data.arxiv?.enabled ?? true,
      categories: data.arxiv?.categories ?? ["cs.AI", "cs.LG", "cs.CL"],
      maxResults: data.arxiv?.max_results ?? 30,
      daysLookback: data.arxiv?.days_lookback ?? 7,
    },
    settings: data.settings ?? {},
  };
}
