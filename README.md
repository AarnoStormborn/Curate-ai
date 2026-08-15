# Curate AI — retrieval-first research curation

A self-hosted research curation and **retrieval** platform rebuilt in TypeScript.
Ingest AI/ML research from arXiv, RSS feeds, and Reddit — or start from a bundled
sample corpus — then search it with a hybrid retrieval engine:

- **BM25 keyword search** (SQLite FTS5)
- **Dense semantic search** (local ONNX embeddings via transformers.js — no API keys)
- **Hybrid fusion** with reciprocal rank fusion (RRF)
- Metadata filters (source type, date range), chunk-level snippets with score breakdowns

Stack: **Fastify** (API) · **React + Vite** (UI) · **SQLite + sqlite-vec + FTS5** ·
**Docker** · **pnpm workspace monorepo**.

> Successor to the original Python pipeline (see [`docs/legacy.md`](docs/legacy.md) for
> the full analysis of what was kept and what was rebuilt). Migration plan:
> [`docs/plan.md`](docs/plan.md).

## Quick start

```bash
# 1. Install (Node >= 24, pnpm)
pnpm install

# 2. Seed the bundled sample corpus (downloads the embedding model on first run)
pnpm seed

# 3. Start the API + dev UI in two terminals
pnpm dev:backend    # Fastify on :4000
pnpm dev:frontend   # Vite on :5173 (proxies /api → :4000)
```

Open http://localhost:5173 and search. Or hit the API directly:

```bash
curl "localhost:4000/api/search?q=vector%20database%20index"
```

### Fetch live sources

```bash
# CLI: fetch arXiv + RSS + Reddit (config in config/sources.yml), index, exit
pnpm --filter @curate-ai/backend ingest --live --sources=arxiv

# API (async, returns the ingest run)
curl -X POST localhost:4000/api/ingest -H "content-type: application/json" \
  -d '{"mode":"live","sources":["arxiv","rss","reddit"]}'
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/search?q=&hybrid=&sourceType=&from=&to=&limit=` | Hybrid (or BM25-only) search with score breakdown |
| `GET /api/documents?limit=&offset=` · `GET /api/documents/:id` | List / inspect documents + chunks |
| `POST /api/documents` · `DELETE /api/documents/:id` | Manual document add / remove |
| `POST /api/ingest` | Run ingestion: `{mode:"seed"\|"live", sources?:[]}` |
| `GET /api/stats` | Index counts, sources, embedding model |
| `GET /api/health` | Liveness |

### Search response shape

```jsonc
{
  "query": "vector database index",
  "results": [{
    "documentId": "...", "chunkId": 3,
    "title": "Vector databases and ANN indexes…",
    "score": {
      "rrf": 0.0328,          // fused via reciprocal rank fusion
      "bm25": 5.173,          // present if BM25 ranked it
      "vector": 0.587,        // cosine similarity if vector ranked it
      "from": ["bm25", "vector"]
    },
    "snippet": "Vector databases index embeddings…"
  }],
  "meta": { "tookMs": 265, "candidates": 7, "from": { "bm25": 1, "vector": 12 } }
}
```

## Configuration (`.env`)

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` / `HOST` | `4000` / `0.0.0.0` | API bind |
| `DATABASE_PATH` | `./data/curate.db` | SQLite file (WAL) |
| `EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | transformers.js model (downloaded to `HF_CACHE`) |
| `EMBEDDING_DIM` | `384` | Must match the model; changes need a fresh DB |
| `HF_CACHE` | `./data/hf-cache` | Model cache (volume-mount in Docker) |
| `INGEST_SOURCES` | `arxiv,rss,reddit` | Live sources |
| `ARXIV_MAX_RESULTS` | `30` | Cap per arXiv fetch |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS |

Data sources (feeds, subreddits, arXiv categories) live in [`config/sources.yml`](config/sources.yml).

## Docker

```bash
docker compose up --build
# UI: http://localhost:8080  (nginx serves the SPA, proxies /api → backend)
```

`curate-data` volume persists the SQLite DB and model cache. Backend runs as a
non-root user with a healthcheck.

## Retrieval design

```
documents ──chunk──► document_chunks ──embed──► chunks_vec (sqlite-vec, cosine ANN)
    │                                                      │
    └──────────────► documents_fts (FTS5, BM25) ───────────┘
                              │
                        query ┴──► BM25 hits + vector hits
                                     │
                            reciprocal rank fusion (RRF)
                                     │
                         filters → snippet → results
```

- **Chunking**: sentence-aligned, overlapping (600 chars / 80 overlap), paragraph-aware,
  hard-split for long sentences — `src/retrieval/chunker.ts`
- **Embeddings**: local ONNX (`all-MiniLM-L6-v2`, q8 quantized), normalized, cached on
  disk; swappable via the `Embedder` interface (`src/embeddings/`)
- **BM25**: FTS5 with porter stemming; queries are token-sanitized
- **Hybrid**: RRF with `k=60` over both ranked lists (`src/retrieval/hybrid.ts`)
- **Audit**: every ingest run is recorded (`ingest_runs`) with per-source counts/errors

## Development

```bash
pnpm -r typecheck        # strict TS across all packages
pnpm -r test             # backend: vitest (unit + API + ingestion fixtures)
                         # frontend: vitest + testing-library
pnpm --filter @curate-ai/backend test:watch
pnpm --filter @curate-ai/backend dev
```

### CLI

```bash
pnpm --filter @curate-ai/backend serve                 # API server
pnpm --filter @curate-ai/backend seed                  # index bundled corpus
pnpm --filter @curate-ai/backend ingest [--live]       # seed or live fetch + index
pnpm --filter @curate-ai/backend search "query"        # terminal search
pnpm --filter @curate-ai/backend stats                 # index stats
```

## Roadmap (retrieval techniques to add)

- Query expansion & multi-query retrieval
- Reranking (cross-encoder / LLM judge) over fused candidates
- Hybrid BM25+vector at the **chunk** level with doc-level aggregation
- Semantic cache for repeated queries
- Vector-filter pushdown in sqlite-vec (`+metadata` columns)
- Evaluation harness: gold-set recall@k / MRR / NDCG dashboards

## License

MIT
