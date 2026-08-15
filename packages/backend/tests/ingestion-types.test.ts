import { describe, expect, it } from "vitest";
import { normalizeUrl, toDocumentInput } from "../src/ingestion/types.js";

describe("normalizeUrl", () => {
  it("strips trailing slashes and fragments", () => {
    expect(normalizeUrl("https://example.com/doc/")).toBe("https://example.com/doc");
    expect(normalizeUrl("https://example.com/doc#section")).toBe("https://example.com/doc");
  });
});

describe("toDocumentInput", () => {
  it("guarantees non-empty content", () => {
    const input = toDocumentInput({
      title: "Title only",
      url: "https://example.com/t",
      source: "Test",
      sourceType: "seed",
      tags: [],
      metadata: {},
    });
    expect(input.content).toBe("Title only");
  });
});
