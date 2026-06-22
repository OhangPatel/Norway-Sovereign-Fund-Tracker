"""Chatbot backend for Sovereign Insights.

A small, self-contained FastAPI service that proxies chat requests to Gemini.
It is intentionally decoupled from the main app: it does not touch nbim.db. The
frontend talks only to this service; this service holds the API key server-side.

Run (localhost only):  uvicorn server:app --host 127.0.0.1 --port 8001 --reload
"""
import logging
from typing import List, Literal

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import config
import key_store
import gemini_client
import data_store
from security import RateLimiter, validate_message

app = FastAPI(title="Sovereign Insights — Chatbot")

# Only the configured frontend origin(s) may call this service from a browser.
# NOTE: CORS is a browser-only control — it does NOT stop scripts/curl from hitting
# the endpoint directly. The rate limits below are what actually bound abuse.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

limiter = RateLimiter(config.RATE_PER_MINUTE, config.RATE_PER_DAY, config.RATE_STATE_PATH)


# ── Cheap DoS guard: reject oversized bodies before parsing ────────────────────
@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > config.MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content={"error": "Request too large."})
    return await call_next(request)


# ── Schemas ───────────────────────────────────────────────────────────────────
class Msg(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(..., max_length=config.MAX_INPUT_CHARS)


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=config.MAX_INPUT_CHARS)
    history: List[Msg] = Field(default_factory=list)


def _client_ip(request: Request) -> str:
    """Best-effort real client IP for per-IP rate limiting.

    When deployed behind a proxy (Render/Railway/nginx/etc.) request.client.host is
    the proxy, so every user would share one IP. With TRUST_PROXY enabled we read the
    left-most entry of X-Forwarded-For instead. This header is client-spoofable, so a
    determined attacker can defeat the *per-IP* limit — but the global daily cap still
    holds, so spend stays bounded regardless.
    """
    if config.TRUST_PROXY:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            first = xff.split(",")[0].strip()
            if first:
                return first
    return request.client.host if request.client else "unknown"


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/api/chat/health")
def health():
    """UI uses this to know whether the assistant is available and how many calls
    remain today. The key is configured server-side (chatbot/.env) and is never
    accepted from, or returned to, the browser."""
    return {
        "ok": True,
        "key_configured": key_store.has_key(),
        "model": config.GEMINI_MODEL,
        "requests_remaining_today": limiter.remaining_today(),
        "holdings_loaded": data_store.META["count"],
        "data_as_of": data_store.META["as_of"],
    }


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    if not key_store.has_key():
        # The server has no key in .env — an operator config issue, not a user action.
        return JSONResponse(
            status_code=503,
            content={"error": "The assistant is currently unavailable."},
        )

    # Rate limit BEFORE doing any work (this is the charge cap).
    limiter.prune()  # keep per-IP memory bounded against floods of unique IPs
    allowed, reason = limiter.check(_client_ip(request))
    if not allowed:
        msg = (
            "Daily message limit reached — try again tomorrow."
            if reason == "daily"
            else "Too many messages — please slow down a moment."
        )
        return JSONResponse(status_code=429, content={"error": msg})

    err = validate_message(req.message, config.MAX_INPUT_CHARS)
    if err:
        return JSONResponse(status_code=400, content={"error": err})

    # Keep only the most recent turns to bound token cost.
    history = [m.model_dump() for m in req.history][-config.MAX_HISTORY_MESSAGES:]
    messages = history + [{"role": "user", "text": req.message.strip()}]

    try:
        reply = await gemini_client.generate(messages)
    except RuntimeError as e:
        status, message = {
            "NO_KEY": (400, "No API key configured."),
            "AUTH": (401, "API key was rejected by Google. Double-check the key."),
            "BAD_REQUEST": (400, "Request rejected (often a bad key or model name)."),
            "MODEL_NOT_FOUND": (502, "The configured AI model is unavailable — check GEMINI_MODEL in .env."),
            "UPSTREAM_RATE": (429, "Google rate-limited the request. Try again shortly."),
            "EMPTY": (502, "The model returned no answer (it may have been blocked)."),
        }.get(str(e), (502, "Chat service error."))
        return JSONResponse(status_code=status, content={"error": message})
    except Exception:
        # Log full detail server-side; never leak internals (which could include the
        # key) to the client.
        logging.getLogger("chatbot").exception("Unexpected error calling Gemini")
        return JSONResponse(status_code=502, content={"error": "Could not reach the chat service."})

    return {"reply": reply, "requests_remaining_today": limiter.remaining_today()}
