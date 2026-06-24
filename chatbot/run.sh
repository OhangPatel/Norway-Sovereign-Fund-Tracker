#!/usr/bin/env bash
# Starts the chatbot backend.
#
# Local dev (default): binds 127.0.0.1:8001, single worker, auto-reload.
# Public deploy: the host platform (Render/Railway/etc.) injects $PORT and expects
#   the app on 0.0.0.0 — set CHATBOT_HOST=0.0.0.0 (and TRUST_PROXY=true) in the
#   platform's env. Keep it to ONE worker so the daily spend cap stays accurate.
set -e
cd "$(dirname "$0")"

HOST="${CHATBOT_HOST:-127.0.0.1}"
PORT="${PORT:-${CHATBOT_PORT:-8001}}"

# --reload (local dev) and --workers are mutually exclusive in uvicorn. Use reload
# locally; in production set CHATBOT_RELOAD=0 to run a single fixed worker instead.
# Keep it to ONE worker so the in-process daily spend cap stays accurate.
if [ "${CHATBOT_RELOAD:-1}" = "0" ]; then
  exec uvicorn server:app --host "$HOST" --port "$PORT" --workers 1
else
  exec uvicorn server:app --host "$HOST" --port "$PORT" --reload
fi
