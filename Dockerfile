# =============================================================================
# Curate AI - Multi-stage Docker Build
# =============================================================================
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml ./
COPY src/ ./src/

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# =============================================================================
# Production Image
# =============================================================================
FROM python:3.12-slim AS runtime

WORKDIR /app

# Create non-root user
RUN groupadd --gid 1000 curate && \
    useradd --uid 1000 --gid curate --shell /bin/bash --create-home curate

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy source code
COPY --chown=curate:curate src/ ./src/
COPY --chown=curate:curate migrations/ ./migrations/

# Create directories for artifacts and logs
RUN mkdir -p /app/artifacts /app/logs && \
    chown -R curate:curate /app/artifacts /app/logs

# Switch to non-root user
USER curate

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV ARTIFACTS_DIR=/app/artifacts

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import curate_ai; print('OK')" || exit 1

# Default command
CMD ["python", "-m", "curate_ai.run"]
