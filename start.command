#!/bin/bash
# Double-click this file in Finder to run Sky Rewind.
# First run installs everything (a minute or two). Later runs start in seconds.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org (LTS), then double-click this file again."
  read -r -p "Press Return to close." _
  exit 1
fi

echo "Installing web packages (first run only)..."
(cd web && [ -d node_modules ] || npm install --no-audit --no-fund)

# Optional agent server: starts only if Python 3 is available
if command -v python3 >/dev/null 2>&1; then
  if [ ! -d .venv ]; then
    echo "Setting up the voice and language agent (first run only)..."
    python3 -m venv .venv
    ./.venv/bin/pip install -q -r server/requirements.txt
  fi
  [ -f server/.env ] || cp server/.env.example server/.env
  ./.venv/bin/uvicorn server.app:app --port 8000 >/tmp/skyrewind-agent.log 2>&1 &
  AGENT_PID=$!
  trap 'kill $AGENT_PID 2>/dev/null' EXIT
  echo "Agent server running on http://127.0.0.1:8000 (log: /tmp/skyrewind-agent.log)"
fi

echo "Opening Sky Rewind at http://localhost:5173"
cd web && npm run dev
