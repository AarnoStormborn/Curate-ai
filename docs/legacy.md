# Curate AI — Legacy System Analysis

> Analysis of the current Python implementation (as of the `main` branch, Jan 2026).
> This document captures *what the system is*, *how it works*, and *what is worth keeping*
> before the TypeScript + pi SDK rebuild. It is the source of truth for the migration.

---

## 1. Overview

**Curate AI** is a personal, self-hosted, batch-oriented AI/ML research curation system:

- Runs every 2–3 days via cron
- Ingests AI/ML content from arXiv, company blogs (RSS), Reddit, and web search
- Filters hype and redundancy
- Generates opinionated, novel angles for LinkedIn posts
- Sends a Slack/email brief
- **Human remains in the loop — never auto-publishes**

### Legacy stack

| Layer | Technology |
|-------|-----------|
| Language | Python 3.10–3.12 |
| LLM | LiteLLM (`litellm`) → OpenAI (`gpt-5-mini` default), JSON-mode structured output |
| DB | PostgreSQL 16 + pgvector (768-dim), async SQLAlchemy 2 + asyncpg |
| Migrations | Alembic |
| Ingestion | httpx + feedparser (+ DuckDuckGo HTML scraping) |
| Email | aiosmtplib + Jinja2 templates |
| Slack | httpx + Jinja2 → Block Kit JSON |
| Logging | structlog (JSON) |
| Scheduler | Ofelia (Docker cron) |
| Tests | pytest + pytest-asyncio (some tests hit live APIs) |
| Packaging | hatchling, `curate-ai` CLI entry point |

---

## 2. Architecture

```
Cron (Ofelia) ──► CLI (run.py)
                      │
                      ▼
                Pipeline (pipeline.py)         6 stages, single async function
   ┌──────────────┬───────────────┬───────────────────┬───────────────┐
   ▼              ▼               ▼                   ▼               ▼
 Source Scout ─► Relevance ─► Insight          Redundancy ─► Asset Curator ─► Editor
 (ingestion)    Filter        Generator         Checker      (images/README)  (compress→brief)
                      │                            │               │               │
                      ▼                            ▼               ▼               ▼
                  PostgreSQL + pgvector (audit trail, embeddings, redundancy memory)
                      │
                      ▼
                Slack webhook (brief) / SMTP email (brief + HTML template)
```

Agents are **not** interactive agents in the modern sense — they are deterministic
pipeline stages: Python functions (some with LLM calls, several still placeholders)
that pass typed Pydantic objects between each other. All state is externalized to
Postgres; processes are short-lived and exit cleanly.

---

## 3. Domain model (the data flow — *keep this*)

This is the core value of the system. Each stage transforms one typed object into the next:

```
IngestionResult (raw source item)
      │  (manager.py: ingest_to_topics)
      ▼
TopicCandidate   {id, title, source, source_type, url, summary, published_at, authors, tags}
      │  (relevance_filter)
      ▼
ScoredTopic      {…TopicCandidate + relevance_score, novelty_score, impact_score,
                   combined_score, is_rejected, rejection_reason}
      │  (insight_generator)
      ▼
InsightAngle     {id, topic_id, stance, why_it_matters, second_order_effects[2-5],
                   relevant_for[1-4], confidence, supporting_evidence}
      │  (redundancy_checker → dedup, within-run + cross-run)
      ▼
InsightAngle (deduplicated)
      │  (asset_curator: angle_id → CuratedAsset[])
      ▼
FinalAngle       {insight ≤200 chars, why_it_matters, relevant_for, framing_points[2-5],
                   supporting_links, assets, confidence, original_topic_title}
      │  (editor: top 3 by confidence)
      ▼
EmailBrief       {run_id, generated_at, angles[1-5], topics_considered,
                   topics_filtered, angles_generated}
```

**Key domain invariants (carry forward):**
- `stance` must be opinionated; `is_neutral_take: false` required for good angles
- `second_order_effects` 2–5 items; `relevant_for` 1–4 audience segments
- `FinalAngle.insight` ≤ 200 chars ("≤2 lines"), framing points ≤ 50 chars each
- Brief caps at 3 angles (top by confidence); schema allows up to 5
- Quality validation (`validate_brief_quality`) checks: ≥1 angle, ≤5 angles, insight length,
  framing points ≥ 2, supporting links present

---

## 4. Component-by-component

### 4.1 Ingestion layer (`src/curate_ai/ingestion/`)

**Base (`base.py`):**
- `IngestionResult` dataclass: title, url, source, source_type, category, summary,
  published_at, authors, tags, score (Reddit), metadata dict
- `SourceConfig` loaded from YAML (`config/sources.yml`) — rss_feeds, subreddits,
  web_search, arxiv, settings (timeouts, user-agent)
- `BaseScraper` ABC: `fetch(days_back)`, `get_timeout()`, `get_user_agent()`

**arXiv (`arxiv.py`):**
- Hits `export.arxiv.org/api/query` with `cat:cs.AI OR cat:cs.LG OR cat:cs.CL`-style
  query, sorted by submittedDate desc
- Parses Atom feed with feedparser; filters by published date ≥ cutoff
- Extracts primary category, tags, authors, PDF link; truncates summary to 1500 chars
- Wrapped in try/except → returns `[]` on failure (fail-soft)

**RSS (`rss_scraper.py`):**
- Fetches all configured feeds concurrently (`asyncio.gather`)
- feedparser; date from `published_parsed` then `updated_parsed`
- Strips HTML from summary, limits 1000 chars; authors from `author(s)`; tags from entries

**Reddit (`reddit.py`):**
- Public JSON API `www.reddit.com/r/{sub}/{sort}.json`, no auth, custom User-Agent
- Skips stickied posts; prefers external URL for link posts, permalink for self posts
- Summary = selftext (≤500 chars) or comment count fallback
- Sorts by Reddit score (engagement); stores upvote_ratio, num_comments in metadata

**Web search (`web_search.py`):**
- POSTs to `html.duckduckgo.com/html/` (scrapes HTML — brittle), extracts
  `result__a` links + `result__snippet`
- Unwraps `uddg=` redirect URLs; skips ads; `published_at` approximated as now
- **Weakest source**: HTML scraping, no dates, no real relevance

**Manager (`manager.py`):**
- Runs all 4 scrapers concurrently with `asyncio.gather(return_exceptions=True)` —
  one failing source never kills the run
- Deduplicates by normalized URL (`rstrip("/").split("#")[0]`)
- Logs per-source counts

### 4.2 Agents (`src/curate_ai/agents/`)

| Agent | File | What it actually does | LLM status |
|-------|------|----------------------|-----------|
| Source Scout | `source_scout.py` | Thin wrapper over `ingest_all_sources()` | none (pure fetch) |
| Relevance Filter | `relevance_filter.py` | Heuristic rejection (hype words, short summary, non-AI keywords) + placeholder scoring | **Placeholder** — `score_topic` returns hardcoded 0.5 scores; LLM tool never wired |
| Insight Generator | `insight_generator.py` | Generates angles | **Placeholder** — returns canned strings ("This development in … signals a shift…") |
| Redundancy Checker | `redundancy_checker.py` | Cosine similarity dedup, within-run + against prior embeddings | **Placeholder** — `compute_embedding` is SHA-256 hash expanded to 768 dims, not real embeddings |
| Asset Curator | `asset_curator.py` | Regex-extracts images from HTML/Markdown, fetches GitHub READMEs, downloads assets, always appends source link | none (pure fetch) |
| Editor | `editor.py` | Deterministic compression (sentence-boundary truncation), framing from second-order effects, top-3 selection, quality validation | none (pure logic) |

**Heuristic filter details (relevance_filter.py):**
- `HYPE_INDICATORS` (~13 words: "revolutionary", "game-changing", "breakthrough"…) —
  reject if ≥3 match
- Reject if summary < 50 chars
- Reject if no AI/ML keyword ("ai", "ml", "llm", "transformer", "model", …) in title+summary
- `PRACTICAL_INDICATORS` (benchmark, performance, latency, code, open source, sdk…) add a
  capped +0.05 boost each (max +0.2) — cheap signal, never applied by a real LLM

**Redundancy details:**
- `cosine_similarity(a, b)` — pure math, unit-tested
- `check_redundancy` — embedding of `stance + why_it_matters`; redundant if max sim ≥
  `SIMILARITY_THRESHOLD` (0.85 default)
- `deduplicate_angles` — cross-run (against prior DB embeddings) *and* within-run
  (accumulates embeddings as it goes); rejected items returned with reasons
- Rejections persisted to `rejected_items` with stage = "redundancy"

**Asset curation details:**
- Markdown `![alt](url)` and HTML `<img src>` regex extraction, extension allowlist
  (png/jpg/jpeg/gif/svg/webp), max 3 assets/source
- GitHub README via `raw.githubusercontent.com/{owner}/{repo}/main|master/README.md`
- `download_asset` saves to `artifacts/{asset_type}/` with retry/backoff (tenacity)
- Always appends the original source URL as a `link` asset
- Note: `local_path`/download only happens when `download=true` (not in dry-run)

### 4.3 Pipeline (`pipeline.py`)

Single async function, 6 stages, one DB transaction context (`get_session` commits at end):

1. **Run record** — `agent_runs` row created with `config_hash` (SHA-256 of
   `llm_model|arxiv_categories|days_lookback` → first 16 hex chars) for replayability
2. **Stage 1 Source Scout** — collect topics; persist all to `topics_seen`; abort run
   ("No topics found") if empty
3. **Stage 2 Relevance Filter** — `filter_topics`; tracks rejection reasons; abort if
   nothing passes
4. **Stage 3 Insight Generator** — `generate_angles_batch`; persists angles + embeddings
5. **Stage 4 Redundancy Checker** — `load_prior_embeddings()` (**stub → returns []**,
   cross-run dedup never actually queries DB), dedup, persist rejections
6. **Stage 5 Asset Curator** — assets for surviving angles (`download = not dry_run`)
7. **Stage 6 Editor** — `create_email_brief` + `validate_brief_quality` (warns on issues)
8. **Mark selected** — `angle_repo.mark_selected(...)` **with a bug**: passes `topic_id`s
   instead of angle IDs (angles in brief carry no angle id), so selection tracking is wrong
9. **Complete run** — status, duration; returns `EmailBrief | None`

`run_pipeline_safe()` wraps it → `(brief, error_message)` tuple. Early-exit paths return
`None` and record the reason on the run.

### 4.4 Database (`src/curate_ai/db/`)

6 tables (migration `001_initial_schema.py`, pgvector extension enabled):

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `agent_runs` | Execution records | status (running/completed/failed), config_hash, duration_seconds, metadata, error_message |
| `topics_seen` | Discovered candidates | source, source_type, url, summary, scores (relevance/novelty/impact/combined), **embedding vector(768)**, run_id FK |
| `angles_generated` | Insight angles | stance, why_it_matters, second_order_effects JSON, relevant_for JSON, confidence, **embedding vector(768)**, is_selected, run_id FK, topic_id FK |
| `angle_scores` | Scoring history | score_type, score_value, metadata |
| `rejected_items` | Rejection audit | item_type, item_id, rejection_reason, rejection_stage (filter/redundancy) |
| `emails_sent` | Dispatch log | recipient, subject, angle_ids JSON, email_hash, success, error_message |

Repositories: `AgentRunRepository`, `TopicRepository` (incl. `get_similar_topics` via
pgvector `<=>` cosine distance), `AngleRepository` (incl. `get_similar_angles`,
`mark_selected`), `RejectedItemRepository`, `EmailRepository`.

Session management: global async engine, `async_sessionmaker`, context-managed
`get_session()` (commit on success, rollback on error). `init_db()` = dev-only
`create_all`; production path = Alembic.

### 4.5 Services

**Slack (`slack_service.py`):**
- Jinja2-rendered **Block Kit** JSON (header, context, sections, framing bullets, links,
  confidence %, stats line, run id)
- Fallback to simple markdown text payload if Block Kit render fails
- POST to webhook; success = HTTP 200 + body `"ok"`
- `send_to_slack(brief) -> bool` convenience wrapper

**Email (`email_service.py`):**
- Jinja2 HTML template (`templates/email_template.html`) + plain-text template; MIME
  multipart/alternative; subject `🔬 AI Research Brief - <Mon dd>`
- `compute_content_hash` (SHA-256, 16 chars) for dedup (stored on `emails_sent`)
- `send_brief(brief, recipient?) -> bool`; requires SMTP host + user configured

### 4.6 LLM layer (`llm.py`)

- `setup_llm()` — puts `OPENAI_API_KEY` into env for LiteLLM
- `llm_complete(prompt, system_prompt, model, temperature=0.7, max_tokens=2000)` — plain
  completion; throws on failure
- `llm_structured(prompt, response_model, …)` — appends Pydantic JSON schema to the
  prompt, requests `response_format={"type": "json_object"}`, temperature 0.3, parses +
  validates with Pydantic
- **Reality check:** no agent in the codebase actually calls `llm_structured`. The
  "agents" with LLM scoring/generation are scaffolding with placeholder bodies.
  The live-pipeline LLM surface is effectively zero.

### 4.7 Config (`config.py`, `.env`, `config/sources.yml`)

`pydantic-settings` `Settings` class, env file `.env`:

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://curate:curate@localhost:5432/curate_ai` | |
| `OPENAI_API_KEY` | `""` | |
| `LLM_MODEL` | `gpt-5-mini` | |
| `SLACK_WEBHOOK_URL` | `""` | |
| `VECTOR_DIMENSION` | `768` | |
| `SIMILARITY_THRESHOLD` | `0.85` | |
| `ARXIV_CATEGORIES` | `cs.AI,cs.LG,cs.CL` | comma-split to list |
| `DAYS_LOOKBACK` | `3` | |
| `ARTIFACTS_DIR` | `./artifacts` | auto-mkdir |
| `LOG_LEVEL` / `LOG_FORMAT` | `INFO` / `json` | |

`config/sources.yml`: 20 RSS feeds (OpenAI, Google Research, BAIR, TechCrunch, Hugging Face,
The Gradient, …), 5 subreddits (r/MachineLearning, r/LocalLLaMA, …), 4 web search queries,
arXiv config (5 categories, max 50 results), global settings (timeout 30s, UA string).

### 4.8 Infra

- **Dockerfile**: multi-stage (builder venv → runtime), non-root user `curate`, healthcheck
  (import check), `CMD python -m curate_ai.run`
- **docker-compose.yml**: `postgres` (pgvector/pgvector:pg16, healthcheck, init script),
  `curate-ai` (depends_on healthy postgres, env passthrough, artifacts/logs volumes),
  `scheduler` (Ofelia, mounts docker.sock + cron/config.ini)
- **cron/config.ini**: `0 6 */2 * *` every 2 days 06:00 UTC → `python -m curate_ai.run`
  (timeout 1800s) + weekly DB cleanup job (referenced but `cleanup_old_runs` **does not
  exist** in code — dead config)
- **scripts/init-db.sql**: just `CREATE EXTENSION IF NOT EXISTS vector` (safety net)

### 4.9 CLI (`run.py`)

`curate-ai [--dry-run] [--debug] [--skip-notify] [--test-notify]` — argparse. `--test-notify`
sends a dummy brief to Slack without running the pipeline. Exit codes: 0 success/no-content,
1 failure.

### 4.10 Tests (`tests/`)

| File | Type | Quality |
|------|------|---------|
| `test_arxiv.py` | **Live API integration** (hits export.arxiv.org) | brittle — depends on network + real data |
| `test_web_search.py` | Live DuckDuckGo HTML scraping | brittle — HTML changes break it |
| `test_redundancy_checker.py` | Pure unit (cosine similarity cases) | good — keep equivalent |
| `test_relevance_filter.py` | Unit (heuristic filters) | good — keep equivalent |
| `test_schemas.py` | Unit (Pydantic validation) | good — keep equivalent |

Note: suite currently cannot even import in a bare checkout (`curate_ai` not installed);
tests were never run in CI.

---

## 5. Key learnings to carry forward

1. **The domain model is the product.** TopicCandidate → ScoredTopic → InsightAngle →
   FinalAngle → EmailBrief with strict length/count constraints is well-designed. Keep it
   verbatim in TypeScript (zod) types.
2. **Opinionated output is a hard requirement.** `stance` must take a position;
   `is_neutral_take` flag; "why it matters" must be specific. Enforce in prompts AND schema.
3. **Heuristic pre-filtering before LLM** (hype words, summary length, AI-keyword gate,
   practical-indicator boost) is cheap and effective. Keep; it protects the LLM budget.
4. **Fail-soft ingestion.** One dead source must never fail the run: per-source
   try/except → `[]`, concurrent gather, per-source result counts, URL-normalized dedup.
5. **Redundancy = embedding + cosine similarity + threshold (0.85)**, both within-run and
   cross-run. The *mechanism* is right; the *embeddings* were fake. In the rebuild, use
   real embeddings (the rest is sound math, unit-tested).
6. **Determinism & audit trail.** config_hash per run, `agent_runs` status/duration,
   `rejected_items` with stage+reason, `angle_scores` history, `emails_sent` log with
   content hash. This makes runs replayable and debuggable. Keep the full audit model.
7. **Human-in-the-loop.** Dry-run / skip-notify / test-notify flags; never auto-publish.
8. **Design principles**: stateless agents, externalized memory, batch execution, clean
   exit, filtering over generation.
9. **Config surface is small and env-driven**; sources config is separate (YAML). Keep the
   split: env for runtime/secrets, file for source definitions.
10. **Slack Block Kit with simple-text fallback**; webhook success = 200 + "ok".
11. **Email = multipart alternative (plain + HTML)**, content hash for dedup.
12. **Asset curation**: image extraction from HTML/Markdown, GitHub README fetch,
    always append source link; downloads only when not dry-run.
13. **Quality gate before send** (`validate_brief_quality`) with explicit issue list —
    keep as a typed validator, not just a warning.

---

## 6. Known gaps, bugs, and dead code (do NOT repeat)

- **LLM never wired in.** Relevance scoring, insight generation, and embeddings are
  placeholders. The "AI" in the pipeline is effectively nonexistent at runtime.
- **`load_prior_embeddings()` stub** — cross-run redundancy never queries the DB.
- **`mark_selected` bug** — brief stores no angle IDs, so pipeline marks `topic_id`s
  as selected; `is_selected` tracking is broken.
- **Pseudo-embeddings** — SHA-256-derived vectors are not semantically meaningful.
- **DuckDuckGo HTML scraping** — brittle, no dates, ad-filter hacks.
- **`cleanup_old_runs` cron job references a function that doesn't exist.**
- **Tests hit live APIs** — non-deterministic, no fixtures/mocking.
- **`main.py`** at repo root is a leftover stub ("Hello from curate-ai!").
- **Editor compression is lossy string surgery** — sentence truncation without LLM
  polish; acceptable MVP but the rebuild should use the LLM for compression (or keep
  deterministic truncation as fallback).
- **Vector dimension hardcoded to 768** — tied to the fake embeddings; real embedding
  models are 384/1536/3072 dims. Dimension must become config-driven.
- **Email/SMTP config referenced in code (`email_to`, `smtp_host`, …) but missing from
  `.env.example`** — incomplete config surface.
- **No CI** — no lint/type/test gate in the repo.

---

## 7. What to keep vs. drop in the rebuild

### Keep (port faithfully)
- Domain model + validation constraints
- Opinionated-output prompts & schema flags
- Heuristic relevance filters
- Redundancy mechanism (real embeddings now)
- Audit-trail DB model (6 tables) & config_hash determinism
- Fail-soft concurrent ingestion with URL dedup
- Source list (RSS feeds/subreddits/arXiv categories in config)
- Slack Block Kit brief + fallback; email multipart + content hash
- CLI flags: dry-run, skip-notify, test-notify
- Quality validation before send

### Drop / replace
- Fake embeddings → real embedding API (or local model)
- Placeholder LLM agents → real pi SDK sessions with structured tools
- DuckDuckGo HTML scraping → structured search (pi's own web_search tool or a real API)
- Ofelia + docker.sock → plain cron in container (node-cron) or host cron
- Alembic/SQLAlchemy → TypeScript migrations (Drizzle or SQL)
- Jinja2/aiosmtplib → TS templating + nodemailer
- structlog → pino
- Dead config (`db-cleanup` job, `main.py` stub)

---

## 8. Repository facts (as of analysis)

- Branch `main`, 3 commits, last commit 2026-01-04, working tree clean
- ~2,740 LOC Python across 21 source files + 5 test files
- Only arXiv ingestion is confirmed "tested" per commit history
- Python deps not installed in checkout; test suite cannot import → **no baseline of
  green tests exists**; the migration can define a new, better baseline
