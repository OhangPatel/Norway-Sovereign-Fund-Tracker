"""Central configuration for the chatbot backend.

Everything that affects cost or security is a tunable here so it can be reviewed
in one place. Values come from chatbot/.env (gitignored) with safe defaults.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(ENV_PATH)

# ── Model + cost controls ─────────────────────────────────────────────────────
# gemini-2.5-flash is current and works on the free tier. (gemini-1.5-flash was
# retired — it 404s; gemini-2.0-flash has free-tier quota of 0 on some projects.)
# Override via GEMINI_MODEL in .env; the README has a diagnostic that lists the
# models your specific key has free quota for.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
# Hard caps on tokens => hard cap on per-request cost.
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "512"))
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "2000"))
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "10"))
GEMINI_TIMEOUT = float(os.getenv("GEMINI_TIMEOUT", "30"))

# ── Rate limits (charge protection) ───────────────────────────────────────────
# Per-IP sliding minute window AND a global daily ceiling. The daily ceiling is
# the important one: no matter what, the backend makes at most RATE_PER_DAY calls
# to Gemini per day, so spend is bounded even if someone floods the endpoint.
RATE_PER_MINUTE = int(os.getenv("RATE_PER_MINUTE", "6"))
RATE_PER_DAY = int(os.getenv("RATE_PER_DAY", "100"))

# The daily counter is persisted here so a restart/redeploy can't silently reset
# your spend ceiling to zero. Lives next to .env and is gitignored.
RATE_STATE_PATH = os.getenv("RATE_STATE_PATH", str(BASE_DIR / "rate_state.json"))

# Reject bodies larger than this before doing any work (cheap DoS guard).
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", str(64 * 1024)))

# ── Network exposure ──────────────────────────────────────────────────────────
# CORS allow-list: which browser origin(s) may call this service. For a public
# deployment set this to your real frontend URL (e.g. https://yourapp.example).
# NOTE: CORS is browser-only — it does not stop direct scripted requests.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080"
    ).split(",")
    if o.strip()
]
# When deployed behind a reverse proxy (Render/Railway/nginx/etc.), set
# TRUST_PROXY=true so per-IP rate limiting reads the real client IP from
# X-Forwarded-For instead of treating every user as the proxy's single IP.
# Leave false for local/direct runs (the header would then be spoofable).
TRUST_PROXY = os.getenv("TRUST_PROXY", "false").strip().lower() in ("1", "true", "yes")

# Bind to localhost by default (safe for local dev). A PaaS host usually requires
# binding 0.0.0.0 and using its injected $PORT — set CHATBOT_HOST=0.0.0.0 there.
HOST = os.getenv("CHATBOT_HOST", "127.0.0.1")
PORT = int(os.getenv("CHATBOT_PORT", "8001"))
