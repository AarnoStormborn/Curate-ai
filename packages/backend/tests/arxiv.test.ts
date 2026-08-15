import { describe, expect, it } from "vitest";
import { fetchArxiv } from "../src/ingestion/arxiv.js";

const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();

const PUBLISHED_FIXTURE = daysAgo(2);

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2501.00001v1</id>
    <published>${PUBLISHED_FIXTURE}</published>
    <title>Hybrid Retrieval with Reciprocal Rank Fusion</title>
    <summary>We present a method to fuse sparse and dense retrieval signals
      using reciprocal rank fusion and show it improves robustness.</summary>
    <author><name>Alice Example</name></author>
    <author><name>Bob Example</name></author>
    <link href="http://arxiv.org/abs/2501.00001v1" rel="alternate" type="text/html"/>
    <link href="http://arxiv.org/pdf/2501.00001v1" rel="related" type="application/pdf"/>
    <category term="cs.IR" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.IR"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2501.00002v2</id>
    <published>${daysAgo(1)}</published>
    <title>Efficient Local Embeddings for Offline Search</title>
    <summary>We benchmark quantized embedding models for local semantic search.</summary>
    <author><name>Carol Example</name></author>
    <link href="http://arxiv.org/abs/2501.00002v2" rel="alternate" type="text/html"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

describe("fetchArxiv", () => {
  it("parses Atom entries into RawItems", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(FIXTURE_XML, { status: 200, headers: { "content-type": "application/atom+xml" } });

    const { items, error } = await fetchArxiv(
      { enabled: true, categories: ["cs.IR"], maxResults: 10, daysLookback: 7 },
      10,
      7,
      fakeFetch as typeof fetch,
    );

    expect(error).toBeUndefined();
    expect(items).toHaveLength(2);

    const first = items[0]!;
    expect(first.title).toBe("Hybrid Retrieval with Reciprocal Rank Fusion");
    expect(first.source).toBe("arXiv");
    expect(first.sourceType).toBe("arxiv");
    expect(first.url).toBe("https://arxiv.org/abs/2501.00001v1");
    expect(first.tags).toContain("cs.IR");
    expect(first.metadata.primaryCategory).toBe("cs.IR");
    expect(first.metadata.pdfUrl).toBe("http://arxiv.org/pdf/2501.00001v1");
    expect(first.publishedAt).toBe(PUBLISHED_FIXTURE);
    expect(first.content!.length).toBeGreaterThan(0);
  });

  it("filters out entries older than daysBack", async () => {
    const fakeFetch = async (): Promise<Response> => new Response(FIXTURE_XML, { status: 200 });
    const { items } = await fetchArxiv(
      { enabled: true, categories: ["cs.IR"], maxResults: 10, daysLookback: 1 },
      10,
      1,
      fakeFetch as typeof fetch,
    );
    expect(items).toEqual([]);
  });

  it("returns error string on HTTP failure", async () => {
    const fakeFetch = async (): Promise<Response> => new Response("nope", { status: 500 });
    const { items, error } = await fetchArxiv(
      { enabled: true, categories: [], maxResults: 10, daysLookback: 7 },
      10,
      7,
      fakeFetch as typeof fetch,
    );
    expect(items).toEqual([]);
    expect(error).toContain("500");
  });

  it("returns empty when disabled", async () => {
    const { items } = await fetchArxiv({ enabled: false, categories: [], maxResults: 10, daysLookback: 7 });
    expect(items).toEqual([]);
  });
});
