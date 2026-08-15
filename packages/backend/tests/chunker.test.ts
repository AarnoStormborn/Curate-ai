import { describe, expect, it } from "vitest";
import { chunkText } from "../src/retrieval/chunker.js";

describe("chunkText", () => {
  it("returns [] for empty text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    const chunks = chunkText("Just a short sentence here.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Just a short sentence here.");
  });

  it("splits long text into multiple chunks", () => {
    const text = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} with some filler words to make it longer.`).join(" ");
    const chunks = chunkText(text, { maxChars: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
  });

  it("produces overlapping chunks that preserve context", () => {
    const text = Array.from({ length: 12 }, (_, i) => `Paragraph sentence ${i} about retrieval systems and embeddings.`).join(" ");
    const chunks = chunkText(text, { maxChars: 150, overlapChars: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    // Every subsequent chunk should share tail vocabulary with the previous one.
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1]!.slice(-40);
      expect(chunks[i]).toContain(prevTail.slice(-10));
    }
  });

  it("hard-splits an enormous single sentence", () => {
    const long = "word ".repeat(500).trim();
    const chunks = chunkText(long, { maxChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
  });

  it("respects paragraph boundaries", () => {
    const text = "First paragraph about apples.\n\nSecond paragraph about bananas and more detail here.";
    const chunks = chunkText(text, { maxChars: 80 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("apples");
    expect(chunks[1]).toContain("bananas");
  });
});
