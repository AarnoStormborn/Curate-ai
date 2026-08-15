import { describe, expect, it } from "vitest";
import { fetchRssFeed } from "../src/ingestion/rss.js";

const FIXTURE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Vector Search in SQLite</title>
      <link>https://example.com/vector-sqlite</link>
      <description><![CDATA[<p>An article about <b>sqlite-vec</b> and ANN search.</p>]]></description>
      <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[
        <p>Vector search is now possible inside SQLite via the sqlite-vec extension.</p>
        <p>It supports HNSW-style indexes over float32 blobs.</p>
      ]]></content:encoded>
      <pubDate>Wed, 05 Feb 2025 12:00:00 GMT</pubDate>
      <category>databases</category>
      <category>retrieval</category>
      <author>someone@example.com (Test Author)</author>
    </item>
    <item>
      <title>No Link Item Should Be Skipped</title>
      <description>This item lacks a link and must be skipped.</description>
    </item>
  </channel>
</rss>`;

describe("fetchRssFeed", () => {
  it("parses items with html-stripped content and dates", async () => {
    const fakeFetch = async (): Promise<Response> => new Response(FIXTURE_RSS, { status: 200 });
    const { items, error } = await fetchRssFeed("https://example.com/feed.xml", "Test Feed", "news", fakeFetch);

    expect(error).toBeUndefined();
    expect(items).toHaveLength(1);

    const item = items[0]!;
    expect(item.title).toBe("Vector Search in SQLite");
    expect(item.url).toBe("https://example.com/vector-sqlite");
    expect(item.source).toBe("Test Feed");
    expect(item.sourceType).toBe("rss");
    expect(item.content).toContain("sqlite-vec");
    expect(item.content).not.toContain("<p>");
    expect(item.publishedAt).toBe("2025-02-05T12:00:00.000Z");
    expect(item.tags).toEqual(["databases", "retrieval"]);
    expect(item.metadata.feed).toBe("https://example.com/feed.xml");
  });

  it("returns error on HTTP failure", async () => {
    const fakeFetch = async (): Promise<Response> => new Response("boom", { status: 503 });
    const { items, error } = await fetchRssFeed("https://example.com/feed.xml", "Test Feed", "news", fakeFetch);
    expect(items).toEqual([]);
    expect(error).toContain("503");
  });
});
