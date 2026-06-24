# Sovereign Insights — NBIM Tracker

A personal dashboard for exploring the equity holdings of Norway's sovereign wealth
fund (NBIM / GPFG), enriched with live market metrics from Yahoo Finance.

> **Doc map:** This README is the current-state source of truth. [ARCHITECTURE.md](ARCHITECTURE.md)
> describes the target/ideal architecture (partly aspirational). [PROJECT_AUDIT.md](PROJECT_AUDIT.md)
> is a point-in-time audit (see its status banner for what's since changed).
> [STYLE_GUIDE.md](STYLE_GUIDE.md) is the design system. Keep these in sync when code changes.

---

## What it does

1. **Scrape** NBIM's published holdings (Playwright) → cleaned CSV + ticker mapping.
2. **Enrich** each holding with Yahoo Finance metrics (yfinance) → SQLite.
3. **Merge** holdings + latest metrics → `data.json`.
4. **Serve** the data via a FastAPI backend and explore it in a React dashboard
   (table, filters, sector charts, company detail with real price history, compare mode).
5. *(partial)* **AI reports** — per-company summaries via a local LLM (Ollama/Mistral).

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 19 + **Vite** (dev server on `:8080`), pure-SVG charts, CSS-variable theming |
| Backend  | FastAPI + Uvicorn (`:8000`) |
| Data     | SQLite (`backend/nbim.db`), yfinance, Playwright |
| AI       | Local Ollama / Mistral via `llm_client.py` |

## Project structure

```
nbim-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app: pipeline triggers + data API
│   │   ├── llm_client.py    # Ollama/Mistral client (local)
│   │   └── rate_limits.json # Daily yfinance run counter (auto-created)
│   ├── pipeline/            # Numbered ETL steps (#0–#5)
│   │   ├── setup_database.py        # #0 create/migrate financial_metrics
│   │   ├── fetch_and_clean_holding.py  # #1 Playwright scrape → holdings CSV
│   │   ├── fetch_yahoo_metrics.py      # #2 yfinance → financial_metrics
│   │   ├── merge_and_enrich.py         # #3 join → data.json + mega CSV
│   │   ├── generate_ai_report.py       # #4 local LLM → generated_reports
│   │   └── export_reports.py           # #5 enriched + reports → CSV
│   ├── nbim.db             # SQLite (gitignored)
│   └── requirements.txt
├── data/
│   ├── holdings_with_tickers.csv       # output of #1, input to #2/#3
│   ├── mega_portfolio_dataset.csv      # final merged backup
│   └── snapshots/                      # raw NBIM scrapes (2023, 2025, …)
├── chatbot/                # SELF-CONTAINED chatbot backend (FastAPI, :8001)
│   ├── server.py           # endpoints: /api/chat, /api/chat/health (key is .env-only)
│   ├── gemini_client.py    # async Gemini call (key in header, token caps)
│   ├── security.py         # rate limiter + input validation
│   ├── key_store.py        # holds key server-side, persists to gitignored .env
│   ├── config.py           # all cost/security knobs
│   ├── .env.example        # GEMINI_API_KEY=  (copy to .env — gitignored)
│   └── README.md           # setup + security notes
├── frontend/
│   ├── index.html          # Vite entry → /src/main.jsx
│   ├── vite.config.js
│   ├── public/             # data.json, favicon.svg, icons.svg
│   └── src/                # main, app, topbar, summary, table, detail,
│                           #   filters, compare, charts, format, chat (.jsx)
├── ARCHITECTURE.md  PROJECT_AUDIT.md  STYLE_GUIDE.md  CLAUDE.md
```

## Database (`backend/nbim.db`)

| Table | Role |
|-------|------|
| `financial_metrics`  | One **current** row per ticker (single `ticker` PK; `INSERT OR REPLACE` overwrites — no history kept) |
| `enriched_holdings`   | Holdings joined with metrics; cache of `data.json` |
| `generated_reports`   | Per-ticker AI summaries (description, outlook, key_risks) |

## API (FastAPI, `:8000`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET  | `/api/pipeline/status`       | Current job status + daily rate-limit |
| POST | `/api/pipeline/fetch-clean`  | Run scrape (#1) |
| POST | `/api/pipeline/metrics-merge`| Run fetch metrics + merge (#2 → #3) |
| POST | `/api/pipeline/ai-report`    | **501 — not wired yet** |
| GET  | `/api/holdings`              | Paginated holdings (deduped latest per ticker) |
| GET  | `/api/history/{ticker}`      | Live close-price series from yfinance (on-demand, not stored) |
| GET  | `/api/quote/{ticker}`        | Live current price for one ticker (on-demand, not stored) |
| GET  | `/api/report/{ticker}`       | Stored AI report for a ticker |

**yfinance protection:** `/api/history` and `/api/quote` are the only live Yahoo
calls. To avoid getting blocked, both share a server-side throttle (`main.py`): a
single lock serializes every yfinance call with a minimum spacing between them
(`MIN_YF_INTERVAL`), and each client IP is capped by a sliding window
(`IP_MAX_CALLS` per `IP_WINDOW`). Over-budget requests get `429`. The frontend
also aborts in-flight history requests on range/company change and rate-limits the
"Get current price" button (in-flight guard + cooldown).

## Running locally

```bash
# Backend
cd backend
pip install -r requirements.txt
python pipeline/setup_database.py        # one-time: create/migrate schema
uvicorn app.main:app --reload --port 8000

# Chatbot backend (optional, separate terminal) — see chatbot/README.md
cd chatbot
pip install -r requirements.txt
./run.sh                                 # FastAPI on http://127.0.0.1:8001 (localhost only)

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                              # Vite dev server on http://localhost:8080
```

## Chatbot (in-app assistant)

A floating assistant (bottom-right) backed by Google **Gemini**, served by a
**separate, self-contained** FastAPI service in [chatbot/](chatbot/) (port `8001`). It is
decoupled from the main backend — it does not touch `nbim.db`.

**Answers data questions, not just definitions.** Via Gemini **function calling**, the
service loads the holdings dataset into memory and exposes two read-only tools
(`query_holdings`, `aggregate`), so it can answer things like *"the largest Canadian
holding"* or *"the 5 financial-sector countries with the lowest average P/E"* — the model
phrases the answer but the numbers come from the data, never from the model. See
[chatbot/README.md](chatbot/README.md#answering-data-questions).

**Security model (the repo is public, the key stays private):**
- The Gemini key lives **only** in `chatbot/.env` (gitignored) and is read at startup.
  It is **never** entered in the browser, never in the frontend bundle, and there is
  **no endpoint to set or change it over the network** — to rotate it, edit `.env` and
  restart. The operator (you) owns the key; end users never supply one.
- Charge protection: a **hard daily request cap** (persisted across restarts), per-IP
  per-minute burst limit (proxy-aware via `X-Forwarded-For`), input/output token limits,
  a request body-size guard, and a CORS allow-list. All knobs live in
  [chatbot/config.py](chatbot/config.py). Full details in [chatbot/README.md](chatbot/README.md).
- **The real spend guarantee is on Google's side:** stay on the free tier (`gemini-2.5-flash`)
  with **no billing account attached** so you cannot be charged, or set a hard quota/budget
  cap if you enable billing. App-level limits are best-effort, not a hard guarantee.
- Get a free key at <https://aistudio.google.com/apikey>.

The frontend currently loads its main dataset from `public/data.json` (regenerated by the
merge step), and calls the backend for pipeline control, live price history, live quotes,
and AI reports.

**Point-in-time consistency in the company drawer:** every stored number (price, P/E,
market cap, 52-week range, …) reflects the last refresh. The price chart is live, so it's
trimmed to end at the company's snapshot date (`fetchedAt`, falling back to `lastFetched`)
to match. The "Get current price" button fetches a live spot price shown inline only — it
is transient and never updates the chart, the headline, or any stored field.

## Known gaps / TODO

- `lastFetched` in `app.jsx` is hardcoded to `'May 7 2026'` — should derive from the data's
  latest `fetched_at`.
- The AI-report pipeline (`generate_ai_report.py`) exists but `/api/pipeline/ai-report`
  still returns `501`; wire it up like the other workers.
- Frontend reads `data.json` rather than `/api/holdings` (server-side filter/sort/paginate
  is the intended direction — see ARCHITECTURE.md §8).
- Intermediate CSVs in `data/` (`fully_cleaned_dataset_with_reasons.csv`) are clutter and
  can be dropped.
