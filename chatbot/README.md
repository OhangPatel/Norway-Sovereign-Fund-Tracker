# Chatbot Backend

A small, **self-contained** FastAPI service that powers the in-app assistant. It is
decoupled from the main backend (it does **not** touch `nbim.db`) — the frontend talks
to it, and it talks to Google Gemini. Lives on its own port (`8001`).

```
frontend  ──>  chatbot backend (:8001)  ──>  Gemini API (function calling)
 chat.jsx       this folder                 │
                holds YOUR key + data.json  └─ tools run here, against the data
```

The assistant can answer **data questions** about the holdings (rankings, counts,
averages by country/sector) by calling read-only tools — see "Answering data
questions" below. It phrases the answer, but every number comes from the dataset,
not the model.

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

## Answering data questions

On startup the service loads the holdings dataset (`config.DATA_PATH`, default
`../frontend/public/data.json`) into memory in [data_store.py](data_store.py) — pure
Python, no database. The model is given two read-only **tools** (declared in
[gemini_client.py](gemini_client.py)) and decides when to call them:

| Tool | Answers questions like |
|---|---|
| `query_holdings` | "the largest Canadian holding", "companies in tech sorted by P/E" |
| `aggregate` | "average P/E by country", "total USD invested per sector", "how many holdings per country" |

Flow: the model picks a tool + arguments → we run it deterministically against the
data → the model phrases the result. So **numbers are never hallucinated**. General
finance questions (e.g. "what is a P/E ratio?") are answered directly, with no tool call.

- **Cost:** a data question makes **2 Gemini calls** (pick tool → phrase answer);
  `MAX_TOOL_CALLS` (default 3) caps the round-trips, so cost per question stays bounded.
- **Result size:** tools return at most 20 rows (default 5) to keep tokens small. Asking
  "all countries" may need an explicit higher limit since the default is 5.
- **Freshness:** `data.json` has no embedded date, so the "as of" date is the file's
  modified time, surfaced as `data_as_of` in `/api/chat/health`.
- **Deploy note:** for a standalone deployment, ship a copy of the data file with the
  service and set `DATA_PATH` to it (the default path assumes the repo layout).

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
| Max output tokens | 1536 | Token-cost inflation (must cover thinking + answer on 2.5/3 models) |
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
