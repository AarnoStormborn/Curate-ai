/** A query-expansion strategy. */
export interface QueryExpander {
  readonly model: string;
  /**
   * Produce multiple phrasings/variants of `query` to broaden retrieval.
   * Must always include the original query first. Throw to trigger the
   * caller's fail-soft fallback (single-query mode).
   */
  expand(query: string): Promise<string[]>;
}

/** Deterministic expander for tests: original + a few fixed rewrites. */
export function createMockExpander(): QueryExpander {
  return {
    model: "mock-expander",
    async expand(query: string): Promise<string[]> {
      return [
        query,
        `${query} embeddings`,
        `${query} retrieval ranking`,
      ];
    },
  };
}