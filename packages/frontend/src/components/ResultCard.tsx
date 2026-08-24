import type { SearchResult } from "@curate-ai/shared";

const SOURCE_BADGES: Record<string, string> = {
  arxiv: "badge-arxiv",
  rss: "badge-rss",
  reddit: "badge-reddit",
  seed: "badge-seed",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ResultCard({ result }: { result: SearchResult }) {
  const { score } = result;
  const badges = score.from.map((t) => (t === "bm25" ? "bm25" : "vector")).join("+");
  return (
    <article className="card">
      <div className="card-head">
        <h3>
          {result.url ? (
            <a href={result.url} target="_blank" rel="noreferrer">
              {result.title}
            </a>
          ) : (
            result.title
          )}
        </h3>
        <div className="badges">
          <span className={`badge ${SOURCE_BADGES[result.sourceType] ?? "badge-seed"}`}>
            {result.sourceType}
          </span>
          <span className="badge badge-rrf">rrf {score.rrf.toFixed(4)}</span>
        </div>
      </div>

      {result.snippet && <p className="snippet">{result.snippet}</p>}
      {result.rerankReason && (
        <p className="rerank-reason">🤖 {result.rerankReason}</p>
      )}

      <div className="card-foot">
        <span className="source">{result.source}</span>
        {score.bm25 !== undefined && (
          <span className="score" title="BM25">
            bm25 {score.bm25.toFixed(3)}
          </span>
        )}
        {score.vector !== undefined && (
          <span className="score" title="cosine similarity">
            vec {score.vector.toFixed(3)}
          </span>
        )}
        <span className="from">via {badges}</span>
        {formatDate(result.publishedAt) && <span className="date">{formatDate(result.publishedAt)}</span>}
        {result.tags.length > 0 && (
          <span className="tags">{result.tags.slice(0, 4).map((t) => `#${t}`).join(" ")}</span>
        )}
      </div>
    </article>
  );
}
