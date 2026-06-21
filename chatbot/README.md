# Chatbot Backend

A small, **self-contained** FastAPI service that powers the in-app assistant. It is
decoupled from the main backend (it does **not** touch `nbim.db`) — the frontend talks
to it, and it talks to Google Gemini. Lives on its own port (`8001`).

```
frontend  ──>  chatbot backend (:8001)  ──>  Gemini API
 chat.jsx       this folder                 holds YOUR key server-side
```

## How the key is handled

**You (the operator) own the key. End users never supply or see one.**
- The key is read **once at startup** from `GEMINI_API_KEY` in `chatbot/.env`.
- `.env` is gitignored (here and at the repo root) → it is never committed.
- There is **no endpoint to set or change the key over the network** — to rotate it,
  edit `.env` and restart. The browser never sends or stores a key.
- The key is sent to Google in a request **header**, not the URL, so it isn't logged.

## Setup (local)

```bash
cd chatbot
pip install -r requirements.txt        # (or reuse the project .venv)
cp .env.example .env                    # then paste YOUR key into .env
./run.sh                                # http://127.0.0.1:8001 (localhost only)
```

Get a **free** Gemini key at <https://aistudio.google.com/apikey>.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/chat/health` | Is the assistant available? How many requests remain today? (never returns the key) |
| POST   | `/api/chat`        | Send a message (`{ "message": "...", "history": [...] }`) |

## Security / anti-charge measures (knobs in `config.py`)

| Control | Default | Protects against |
|---|---|---|
| **Global daily cap** (persisted across restarts) | **100 / day** | **Runaway spend — hard ceiling on Gemini calls** |
| Per-IP rate limit (proxy-aware) | 6 / minute | One client flooding the endpoint |
| Memory pruning of per-IP state | — | Floods of unique/spoofed IPs bloating RAM |
| Max input length | 2000 chars | Token-cost inflation |
| Max output tokens | 512 | Token-cost inflation |
| Max history kept | 10 messages | Token-cost inflation |
| Max body size | 64 KB | Oversized payloads / cheap DoS |
| CORS allow-list | frontend origin | Other *sites* calling your backend from a browser |

> CORS is **browser-only** — it does not stop `curl`/scripts from hitting the endpoint
> directly. The rate limits are what actually bound abuse.

## ⚠️ The real spend guarantee is on Google's side

App-level limits are **best-effort**, not a hard guarantee — they can be weakened by
server restarts, running more than one worker/instance, or a client spoofing
`X-Forwarded-For`. The only **unbypassable** protection is a cap on Google's side:

1. **Stay on the free tier** (`gemini-2.5-flash`) with **no billing account attached**.
   With no card on the project, Google *cannot* charge you — the worst case is `429`
   rate-limit errors. This is the simplest way to guarantee zero spend.
2. If you ever enable billing, set a **hard quota cap + budget alert** in Google Cloud
   Console, and **restrict the API key** (API restrictions → Generative Language API only).

## Deploying to the public internet

Because abuse only matters once strangers can reach the backend, set these on your host:

| Env var | Value | Why |
|---|---|---|
| `GEMINI_API_KEY` | your key | The key (set it in the host's secret store, **not** in git) |
| `CHATBOT_HOST` | `0.0.0.0` | PaaS hosts route to the container on all interfaces |
| `CHATBOT_RELOAD` | `0` | Disable dev auto-reload in production |
| `TRUST_PROXY` | `true` | Read the real client IP from `X-Forwarded-For` for per-IP limits |
| `ALLOWED_ORIGINS` | `https://yourapp.example` | Lock CORS to your real frontend origin |
| `RATE_PER_DAY` | `100` | Your hard daily spend ceiling |

Then point the **frontend** at the deployed backend by setting `VITE_CHAT_API`
(e.g. `VITE_CHAT_API=https://chatbot.yourapp.example`) at build time.

**Run a single worker/instance.** The daily cap is counted in-process and persisted to
`rate_state.json`; multiple workers or instances each keep their own counter, so the
effective cap multiplies. For horizontal scaling, move the counter to Redis.
