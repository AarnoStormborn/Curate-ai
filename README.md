# Curate AI

**Personal, self-hosted AI/ML research and insight generation system.**

Curate AI is a batch-oriented research curation system that runs every 2-3 days to:
- 🔬 Research recent AI/ML developments from arXiv, company blogs, and GitHub
- 🎯 Filter out hype and redundancy
- 💡 Generate opinionated, novel angles suitable for LinkedIn posts
- 💬 Send you a Slack notification with a concise research brief

**Human remains in the loop. Curate never auto-publishes.**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Cron Scheduler                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Agent Pipeline                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Source Scout │→ │  Relevance   │→ │   Insight    │       │
│  │    Agent     │  │    Filter    │  │  Generator   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│          ↓                                   ↓               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Redundancy  │← │    Asset     │← │    Editor    │       │
│  │   Checker    │  │   Curator    │  │    Agent     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Memory Layer                              │
│  ┌──────────────────────┐  ┌────────────────────────────┐   │
│  │  PostgreSQL          │  │  pgvector                  │   │
│  │  (Structured Memory) │  │  (Semantic Memory)          │   │
│  └──────────────────────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                    💬 Slack Brief
```

## Features

- **6 Modular Agents** with LiteLLM (OpenAI) and structured Pydantic I/O
- **Stateless Execution** - All memory externalized to PostgreSQL + pgvector
- **Batch-Oriented** - Runs via cron, no long-running processes
- **Opinionated Output** - No neutral takes, focuses on "why it matters"
- **Redundancy Detection** - Semantic similarity to avoid repeating themes
- **Deterministic & Replayable** - Config hashing, full audit trail

## Quick Start

### Prerequisites

- Python 3.10+
- Docker & Docker Compose
- OpenAI API key

### Installation

```bash
# Clone and enter directory
cd curate-ai

# Copy environment config
cp .env.example .env

# Edit .env with your credentials
# - OPENAI_API_KEY (required)
# - SLACK_WEBHOOK_URL (for notifications)

# Start services
docker-compose up -d

# Run migrations
docker-compose exec curate-ai alembic upgrade head

# Test the pipeline (dry run)
docker-compose exec curate-ai python -m curate_ai.run --dry-run
```

### Local Development

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install with dev dependencies
pip install -e ".[dev]"

# Start PostgreSQL only
docker-compose up -d postgres

# Run migrations
alembic upgrade head

# Run pipeline
python -m curate_ai.run --dry-run --debug
```

## Usage

```bash
# Full pipeline with Slack notification
curate-ai

# Dry run (no notification)
curate-ai --dry-run

# Debug mode
curate-ai --debug

# Test Slack notification
curate-ai --test-notify
```

## Configuration

All configuration via environment variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql+asyncpg://...` |
| `OPENAI_API_KEY` | OpenAI API key | *required* |
| `LLM_MODEL` | LLM model (via LiteLLM) | `gpt-5-mini` |
| `SLACK_WEBHOOK_URL` | Slack webhook URL | *required for notifications* |
| `SIMILARITY_THRESHOLD` | Redundancy threshold | `0.85` |
| `DAYS_LOOKBACK` | Days to look back | `3` |


## Database Schema

| Table | Purpose |
|-------|---------|
| `agent_runs` | Pipeline execution records |
| `topics_seen` | Discovered topic candidates |
| `angles_generated` | Insight angles with embeddings |
| `angle_scores` | Scoring history |
| `rejected_items` | Rejection reasons |
| `emails_sent` | Email dispatch log |

## Design Principles

1. **Agents are stateless** - No in-process memory between runs
2. **All memory externalized** - PostgreSQL + pgvector
3. **Batch execution** - Triggered by cron, clean exit
4. **Deterministic runs** - Config hashed, fully replayable
5. **Filtering over generation** - Prefer to filter/frame, not raw generate
6. **Opinionated output mandatory** - No neutral takes allowed

## Scheduling

The system uses [Ofelia](https://github.com/mcuadros/ofelia) for Docker-based scheduling:

```ini
# cron/config.ini
[job-exec "curate-ai-run"]
schedule = 0 6 */2 * *  # Every 2 days at 6 AM UTC
container = curate-ai-app
command = python -m curate_ai.run
```

Or use system cron:
```cron
0 6 */2 * * cd /path/to/curate-ai && docker-compose exec -T curate-ai python -m curate_ai.run
```

## Email Output

Each brief contains:
- **Top 2-3 post-worthy angles**
- For each angle:
  - Core insight (≤2 lines)
  - Why it matters
  - Who it's relevant for
  - Framing suggestions
  - Supporting links/assets
  - Confidence score

## Development

```bash
# Run tests
pytest tests/ -v

# With coverage
pytest tests/ --cov=curate_ai

# Lint
ruff check .

# Type check
mypy src/
```

## License

MIT

---

*Curate AI: Research intelligence, not a chatbot.*
