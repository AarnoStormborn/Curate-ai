import { useEffect, useState, type FormEvent } from "react";
import type { SearchResponse, Stats } from "@curate-ai/shared";
import { fetchStats, search, triggerIngest } from "./api.js";
import { ResultCard } from "./components/ResultCard.js";

const MODE_OPTIONS = [
  { value: "hybrid", label: "hybrid (bm25 + vector)" },
  { value: "bm25", label: "bm25 only" },
  { value: "vector", label: "vector only" },
  { value: "rerank", label: "hybrid + LLM rerank" },
  { value: "expand", label: "hybrid + query expansion" },
  { value: "expand-rerank", label: "expand + rerank" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "arxiv", label: "arXiv" },
  { value: "rss", label: "RSS" },
  { value: "reddit", label: "Reddit" },
  { value: "seed", label: "Seed" },
];

export default function App() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [sourceType, setSourceType] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStats = (): void => {
    fetchStats()
      .then(setStats)
      .catch(() => setStats(null));
  };

  useEffect(() => {
    refreshStats();
  }, []);

  const runSearch = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await search(q, { hybrid: mode !== "bm25", mode, sourceType });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const runIngest = async (mode: "seed" | "live"): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await triggerIngest(mode);
      refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>
          <span className="logo">🔬</span> Curate&nbsp;AI
        </h1>
        <p className="tagline">
          retrieval-first research curation — BM25 + dense vectors + reciprocal rank fusion
        </p>
      </header>

      <form className="search-bar" onSubmit={(e) => void runSearch(e)}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search research, retrieval, embeddings, agents…"
          aria-label="Search query"
          autoFocus
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <div className="controls">
        <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Retrieval mode">
          {MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          aria-label="Source filter"
        >
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="ingest-actions">
          <button className="ghost" onClick={() => void runIngest("seed")} disabled={loading}>
            Re-seed
          </button>
          <button className="ghost" onClick={() => void runIngest("live")} disabled={loading}>
            Fetch live
          </button>
        </div>
      </div>

      {error && <div className="error">⚠ {error}</div>}

      <main className="results">
        {result && (
          <div className="results-meta">
            <span>
              {result.results.length} results for <em>“{result.query}”</em>
              {result.meta.mode === "rerank" && (
                <span className={`badge ${result.meta.reranked ? "badge-rrf" : "badge-seed"}`}>
                  {result.meta.reranked ? `reranked ${result.meta.rerankModel ?? ""}` : "rerank fallback"}
                </span>
              )}
              {result.meta.expanded && (
                <span className="badge badge-expand">
                  expanded ×{result.meta.expansions?.length ?? 2}
                </span>
              )}
            </span>
            <span className="meta-right">
              {result.meta.tookMs} ms · {result.meta.candidates} candidates ·{" "}
              {result.meta.from.bm25} bm25 / {result.meta.from.vector} vector hits
            </span>
          </div>
        )}
        {result?.results.map((r) => <ResultCard key={r.documentId} result={r} />)}
        {result && result.results.length === 0 && (
          <div className="empty">No results. Try different terms, or re-seed the corpus.</div>
        )}
      </main>

      <footer className="footer">
        {stats ? (
          <span>
            {stats.documents} documents · {stats.chunks} chunks ·{" "}
            {Object.entries(stats.sources)
              .map(([k, v]) => `${k}:${v}`)
              .join(" · ")}{" "}
            — {stats.embeddingModel} ({stats.embeddingDim}d)
          </span>
        ) : (
          <span>—</span>
        )}
      </footer>
    </div>
  );
}
