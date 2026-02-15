# Dockerfile for Hedge Edge License API
# Optimized for Railway usage-based pricing (minimal RAM footprint)
# Single Uvicorn worker handles async concurrency natively — Gunicorn unnecessary for <500 users

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.production.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.production.txt

# Copy application code (all .py files for future local imports)
COPY *.py .

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Expose port
EXPOSE 8000

# Run with single uvicorn worker for cost efficiency on Railway
# Gunicorn is unnecessary for <500 users — uvicorn handles async concurrency natively
# At ~60MB RAM, this stays well within Railway's $5/mo free credit
CMD ["sh", "-c", "uvicorn license_api_production:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --log-level info"]
