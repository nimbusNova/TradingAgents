FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install tradingagents package first (layer-cached unless source changes)
COPY pyproject.toml requirements.txt ./
COPY tradingagents/ ./tradingagents/
RUN pip install --no-cache-dir .

# Install backend-specific dependencies
COPY backend/requirements.txt ./backend-requirements.txt
RUN pip install --no-cache-dir -r backend-requirements.txt

# Copy backend source
COPY backend/app/ ./backend/app/

WORKDIR /app/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
