#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION="$(date '+%Y-%m-%d_%H-%M-%S')"
LOG_DIR="$SCRIPT_DIR/logs/$SESSION"
mkdir -p "$LOG_DIR"

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

CONDA_PYTHON="$HOME/miniconda3/envs/tradingagents/bin/python"

# Prefer a real Node.js binary over bun's shim to avoid bun injecting
# browser globals (localStorage etc.) into the Next.js SSR process.
NODE="$(PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" command -v node 2>/dev/null || true)"

# Validate runtimes
if [[ ! -x "$CONDA_PYTHON" ]]; then
  echo "ERROR: conda env not found at $CONDA_PYTHON"
  echo "       Run: conda create -n tradingagents python=3.12 && pip install -e . -r backend/requirements.txt"
  exit 1
fi
if [[ -z "$NODE" ]]; then
  echo "ERROR: node not found — install via: brew install node"
  exit 1
fi

cleanup() {
  echo ""
  echo "Shutting down…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "Logs saved to: $LOG_DIR"
}
trap cleanup INT TERM

echo "Session : $SESSION"
echo "Logs    : $LOG_DIR"
echo ""

# Start backend
cd "$SCRIPT_DIR/backend"
"$CONDA_PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload \
  >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "Backend  PID $BACKEND_PID  → logs/$SESSION/backend.log"

# Start frontend — disable Node.js v22+ Web Storage API so Next.js dev overlay
# guards (typeof localStorage !== 'undefined') behave as expected during SSR.
cd "$SCRIPT_DIR/frontend"
"$NODE" --no-experimental-webstorage node_modules/.bin/next dev --port 3001 \
  >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID $FRONTEND_PID  → logs/$SESSION/frontend.log"

echo ""
echo "Ready at http://localhost:3001  (backend :8001)"
echo "Press Ctrl+C to stop both."
echo ""

wait "$BACKEND_PID" "$FRONTEND_PID"
