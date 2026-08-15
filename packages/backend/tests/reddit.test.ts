import { describe, expect, it } from "vitest";
import { fetchSubreddit } from "../src/ingestion/reddit.js";

const FIXTURE_JSON = {
  data: {
    children: [
      {
        data: {
          title: "Local embeddings for offline RAG",
          url: "https://example.com/local-embeddings",
          is_self: false,
          stickied: false,
          created_utc: 1738760000,
          author: "test_user",
          score: 120,
          num_comments: 45,
          upvote_ratio: 0.91,
          subreddit: "LocalLLaMA",
          permalink: "/r/LocalLLaMA/comments/abc/local_embeddings/",
        },
      },
      {
        data: {
          title: "Self post about chunking overlap",
          url: "https://www.reddit.com/r/LocalLLaMA/comments/xyz/self_post/",
          permalink: "/r/LocalLLaMA/comments/xyz/self_post/",
          is_self: true,
          stickied: false,
          created_utc: 1738761000,
          selftext: "What overlap size do you use for 384-dim embeddings? I have been using 80 chars.",
          author: "chunker_fan",
          score: 8,
          num_comments: 3,
          upvote_ratio: 0.8,
          subreddit: "LocalLLaMA",
        },
      },
      {
        data: {
          title: "Stickied mod post",
          url: "https://www.reddit.com/r/LocalLLaMA/",
          is_self: true,
          stickied: true,
          created_utc: 1738762000,
          score: 1,
          subreddit: "LocalLLaMA",
        },
      },
    ],
  },
};

describe("fetchSubreddit", () => {
  it("parses posts, skips stickied, prefers permalink for self posts", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify(FIXTURE_JSON), { status: 200, headers: { "content-type": "application/json" } });

    const { items, error } = await fetchSubreddit("LocalLLaMA", "r/LocalLLaMA", "hot", 25, fakeFetch);
    expect(error).toBeUndefined();
    expect(items).toHaveLength(2);

    const [link, self] = items;
    expect(link!.sourceType).toBe("reddit");
    expect(link!.url).toBe("https://example.com/local-embeddings");
    expect(link!.metadata.score).toBe(120);
    expect(link!.metadata.numComments).toBe(45);
    expect(link!.publishedAt).toBe(new Date(1738760000 * 1000).toISOString());

    expect(self!.url).toContain("reddit.com");
    expect(self!.content).toContain("overlap");
  });

  it("returns error on HTTP failure", async () => {
    const fakeFetch = async (): Promise<Response> => new Response("denied", { status: 403 });
    const { items, error } = await fetchSubreddit("LocalLLaMA", "r/LocalLLaMA", "hot", 25, fakeFetch);
    expect(items).toEqual([]);
    expect(error).toContain("403");
  });
});
