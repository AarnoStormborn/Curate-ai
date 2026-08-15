import type { RawItem } from "./types.js";

interface RedditPost {
  title?: string;
  url?: string;
  permalink?: string;
  is_self?: boolean;
  selftext?: string;
  stickied?: boolean;
  created_utc?: number;
  author?: string;
  score?: number;
  num_comments?: number;
  upvote_ratio?: number;
  link_flair_text?: string | null;
  subreddit?: string;
}

const stripHtml = (s: string): string =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Fetch posts from a subreddit via Reddit's public JSON API.
 * No auth; requires a descriptive User-Agent (Reddit policy).
 */
export async function fetchSubreddit(
  subreddit: string,
  sourceName: string,
  sort = "hot",
  limit = 25,
  fetcher: typeof fetch = fetch,
): Promise<{ items: RawItem[]; error?: string }> {
  try {
    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort}.json?limit=${limit}&raw_json=1`;
    const res = await fetcher(url, {
      headers: { "User-Agent": "CurateAI/0.2 (research curation)" },
    });
    if (!res.ok) return { items: [], error: `Reddit HTTP ${res.status} for r/${subreddit}` };
    const json = (await res.json()) as {
      data?: { children?: Array<{ data?: RedditPost }> };
    };

    const items: RawItem[] = [];
    for (const child of json.data?.children ?? []) {
      const post = child.data ?? {};
      if (!post.title) continue;
      if (post.stickied) continue;

      const self = post.is_self ?? false;
      const finalUrl = self
        ? `https://www.reddit.com${post.permalink ?? ""}`
        : (post.url ?? "");
      if (!finalUrl || !finalUrl.startsWith("http")) continue;

      const selftext = stripHtml(post.selftext ?? "").slice(0, 3000);
      const published = post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined;

      items.push({
        title: post.title.trim(),
        url: finalUrl,
        source: sourceName,
        sourceType: "reddit",
        summary: selftext.slice(0, 400),
        content: selftext || `Reddit post with ${post.num_comments ?? 0} comments`,
        publishedAt: published,
        tags: post.link_flair_text ? [post.link_flair_text] : [],
        metadata: {
          subreddit: post.subreddit ?? subreddit,
          permalink: `https://www.reddit.com${post.permalink ?? ""}`,
          score: post.score ?? 0,
          numComments: post.num_comments ?? 0,
          upvoteRatio: post.upvote_ratio ?? 0,
          author: post.author ?? null,
        },
      });
    }
    return { items };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}
