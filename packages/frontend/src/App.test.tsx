import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App.js";

const MOCK_STATS = {
  documents: 3,
  chunks: 6,
  sources: { seed: 3 },
  embeddingModel: "mock-mini",
  embeddingDim: 384,
  lastIngest: null,
};

const MOCK_SEARCH = {
  query: "embeddings",
  results: [
    {
      documentId: "doc-1",
      title: "Dense embeddings for semantic search",
      url: "https://example.com/1",
      source: "Test",
      sourceType: "seed",
      snippet: "Text embeddings map strings to vectors.",
      score: { rrf: 0.016, bm25: 2.1, from: ["bm25", "vector"] as const },
      tags: ["embeddings"],
      publishedAt: "2025-01-01T00:00:00Z",
    },
  ],
  meta: { tookMs: 3, candidates: 1, from: { bm25: 1, vector: 1 }, mode: "hybrid" },
};

function mockFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/stats")) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_STATS), { status: 200 }));
      }
      if (url.includes("/search")) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_SEARCH), { status: 200 }));
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    }),
  );
}

beforeEach(() => {
  mockFetch();
});

describe("App", () => {
  it("renders the header and stats footer", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /curate/i })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/3 documents/i)).toBeTruthy();
    });
  });

  it("runs a search and renders result cards", async () => {
    render(<App />);
    const input = screen.getByLabelText(/search query/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "embeddings" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/dense embeddings for semantic search/i)).toBeTruthy();
    });
    expect(screen.getByText(/rrf 0.016/i)).toBeTruthy();
  });

  it("toggles hybrid mode off", async () => {
    render(<App />);
    const toggle = screen.getByLabelText(/hybrid/i) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
  });
});
