# Curate AI — TypeScript Rebuild Plan (revised)

> Revision 2 (supersedes the original pi-SDK-CLI plan). Legacy analysis:
> [`docs/legacy.md`](./legacy.md). Status: **baseline implemented** (see §6).

---

## 1. Direction change (Rev 1 → Rev 2)

The original plan proposed a batch CLI pipeline driven by pi SDK agent sessions.
During execution the architecture pivoted to a **retrieval-first web application**:

| Decision | Choice |
|----------|--------|
| Backend | **Fastify** (API-first, not batch CLI) |
| Frontend | **React + Vite** (search UI) |
| Storage | **SQLite + sqlite-vec + FTS5** (single file, zero-ops) |
| Deploy | **Docker** (backend + nginx-served SPA) |
| Embeddings | **Local ONNX via transformers.js** (`all-MiniLM-L6-v2`, q8) — no API keys |
| LLM agents | **Deferred** — pi SDK integration is Phase 2 (below); baseline is retrieval-only |
| Monorepo | pnpm workspaces: `shared` / `backend` / `frontend` |

What carried over from the legacy Python system (see `legacy.md` §5):
opinionated domain model & constraints, fail-soft concurrent ingestion with URL
dedup, heuristic-free-but-simple chunking, audit trails (`ingest_runs`), config
split (env + `config/sources.yml`), and the curated source list.

What was deliberately dropped: fake 768-dim pseudo-embeddings, brittle DuckDuckGo
HTML scraping, Ofelia+docker.sock cron, Alembic/Postgres/pgvector, Jinja2 SMTP/Slack.

---

## 2. Architecture (as built)

```
                    ┌─────────────────────────────────────────────┐
                    │  React UI (Vite, /api proxied)              │
                    └───────────────────┬─────────────────────────┘
                                        │ HTTP
                    ┌───────────────────▼─────────────────────────┐
                    │  Fastify backend                             │
                    │  routes: search · documents · ingest · stats │
                    ├──────────────────────────────────────────────┤
                    │  retrieval/search.ts (orchestrator)          │
                    │   ├─ bm25.ts   (FTS5 BM25, sanitized query)  │
                    │   ├─ vector.ts (sqlite-vec cosine ANN)       │
                    │   └─ hybrid.ts (reciprocal rank fusion k=60) │
                    ├──────────────────────────────────────────────┤
                    │  indexer.ts ─ chunker.ts ─ embeddings/local  │
                    │  ingestion/ (arxiv · rss · reddit · manager) │
                    ├──────────────────────────────────────────────┤
                    │  db/  SQLite: documents · document_chunks ·  │
                    │        documents_fts (FTS5) · chunks_vec     │
                    │        (vec0) · ingest_runs                  │
                    └──────────────────────────────────────────────┘
```

Key files: `packages/backend/src/retrieval/` (engine),
`packages/backend/src/ingestion/` (sources), `packages/backend/src/db/` (schema+repo),
`packages/shared/src/schemas.ts` (zod contracts shared with the frontend).

### Retrieval techniques in the baseline

1. **BM25 keyword search** — SQLite FTS5 (`porter unicode61` tokenizer), documents
   joined to the FTS rowid; `-bm25()` score; query tokens sanitized into quoted
   phrases (no injection, no stray operators).
2. **Dense vector search** — sentence-aligned overlapping chunks (600/80 chars,
   paragraph-aware, hard-split for long sentences) embedded locally (q8 ONNX,
   normalized) into `chunks_vec` (sqlite-vec `vec0`, cosine). Chunk hits are rolled
   up to documents keeping the best distance.
3. **Hybrid fusion (RRF)** — ranked lists from both techniques fused with
   `Σ 1/(k + rank)`, `k=60`; results carry a per-technique score breakdown and the
   techniques that surfaced them. `hybrid=false` degrades to BM25-only.
4. **Filters** — source type + inclusive date range applied post-fusion.
5. **Snippets** — best-matching chunk excerpt (280 chars) with chunk id.

---

## 3. Ingestion layer

- `fetchLiveSources()` runs arXiv/RSS/Reddit **concurrently** (`Promise.allSettled`),
  each source fail-soft (errors logged per source, never kill the run), dedup by
  normalized URL (trailing-slash + fragment stripped).
- arXiv: Atom API parsed with `fast-xml-parser` (primary category, PDF link, authors,
  date-window filter).
- RSS: `rss-parser` with HTML stripping, date precedence (`isoDate` → `pubDate`),
  `content:encoded` support.
- Reddit: public JSON API, skips stickied, self-posts → permalink, external → URL,
  score/upvote metadata kept.
- `config/sources.yml` (ported from legacy) drives feeds/subreddits/arXiv; env vars
  cap arXiv size and lookback.
- Seed corpus: 15 realistic retrieval/AI documents bundled in
  `packages/backend/src/seed/corpus.ts` — offline baseline + deterministic tests.

## 4. Storage (SQLite)

```
documents        — canonical rows (url UNIQUE, source_type CHECK, tags/metadata JSON)
document_chunks  — chunk rows (document_id FK, chunk_index UNIQUE pair)
documents_fts    — FTS5 virtual table (rowid = documents rowid)
chunks_vec       — vec0 virtual table (rowid = chunk id, float[384] cosine)
ingest_runs      — audit: status, items_fetched/indexed, duration_ms, error
schema_migrations— versioned DDL runner (v1)
```

Notes: `journal_mode=WAL`; FK cascades; sqlite-vec rowids must be bound as **BigInt**
with better-sqlite3 (integers only — plain JS numbers bind as REAL and are rejected).
Embedding dimension is fixed at table creation — changing the model requires a fresh DB.

## 5. Services & infra

- **Docker**: `Dockerfile.backend` (node:24-slim, pnpm workspace, tsup build, prod-only
  deps, non-root user, healthcheck) and `Dockerfile.frontend` (vite build → nginx:alpine
  serving the SPA and proxying `/api` → backend). `docker-compose.yml` wires both with a
  `curate-data` volume for the DB + model cache.
- **Scheduling**: no in-app cron yet. Live fetch is CLI/API-triggered; a host crontab
  line (`docker compose exec backend node packages/backend/dist/index.js ingest --live`)
  covers scheduled runs. (node-cron or Ofelia can be added later.)
- **Logging**: pino via Fastify; CLI prints JSON summaries.
- **Testing**: backend vitest — chunker (overlap/boundaries/hard-split), RRF math,
  BM25/vector/search orchestration with a deterministic mock embedder, Fastify
  `inject()` API tests, ingestion parser fixtures (arXiv Atom, RSS, Reddit JSON) with
  mocked HTTP. Frontend vitest + testing-library (search flow, toggles) with mocked
  fetch. All offline; no live network in CI.

## 6. Status & what's next

**Done (baseline):** monorepo scaffold · local embedding pipeline · hybrid search API ·
documents CRUD · seed + live ingest · React search UI · Docker · 54 tests green ·
strict typecheck clean.

**Done (eval harness):** `src/retrieval/metrics.ts` + `evaluate.ts`, 27-query gold set
in `src/seed/gold-set.ts`, `curate-ai eval` CLI with mode comparison and missed-query
reporting. Baseline measured on the real model: **hybrid** recall@10 1.000 / MRR 0.975 /
NDCG 0.982 · **vector** 1.000 / 0.957 / 0.968 · **bm25** 0.481 / 0.481 / 0.481.

**Done (pi SDK LLM reranking):** `src/llm/pi-reranker.ts` — `mode=rerank` runs a pi
agent session over the hybrid candidate pool with a terminating structured tool,
per-verdict relevance + reason, text-answer parsing last resort, attempt retries,
and graceful hybrid fallback (`meta.reranked=false`). Auth: `~/.pi/agent` login or
`RERANK_API_KEY` (docker-compose passthrough + .env.example included).

Baseline (all four modes, real model — opencode-go/deepseek-v4-flash reranker):

```
mode     recall@k  mrr      ndcg@k
hybrid      1.000    0.975    0.982
bm25        0.481    0.481    0.481
vector      1.000    0.957    0.968
rerank      1.000    1.000    0.997
```

Reranking is the winning stage: MRR 0.975 → 1.000, NDCG 0.982 → 0.997.

**Next phases:**

- **Phase 3 — retrieval depth**: query expansion, chunk-level hybrid with doc
  aggregation, vector metadata-filter pushdown, semantic cache — each measured
  against the eval baseline above.
- **Phase 2 remainder — curation agents**: `stageSession()` insight/angle generation
  (same pi SDK infra as the reranker) for the curated-brief side.
- **Phase 4 — scheduling**: in-container cron or ofelia-free host cron + `ingest_runs`
  reporting.
