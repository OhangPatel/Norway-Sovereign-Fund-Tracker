# Sovereign Insights — Architecture & Refactor Guide

> **Who this is for:** Future you. Written assuming you understand Python and JavaScript
> basics but are still building intuition for backend architecture and SQLite.
> Every decision below has a "Why?" explanation.

---

## Table of Contents

1. [What's Wrong With the Current Code](#1-whats-wrong-with-the-current-code)
2. [The Big Picture — Ideal Architecture](#2-the-big-picture--ideal-architecture)
3. [Proposed Folder Structure](#3-proposed-folder-structure)
4. [SQLite Explained Simply](#4-sqlite-explained-simply)
5. [CSV vs SQLite — Clear Decision](#5-csv-vs-sqlite--clear-decision)
6. [Database Schema Design](#6-database-schema-design)
7. [Data Flow — End to End](#7-data-flow--end-to-end)
8. [API Architecture](#8-api-architecture)
9. [Real Historical Charts](#9-real-historical-charts)
10. [Multi-Year Dataset Support](#10-multi-year-dataset-support)
11. [Background Task Visibility](#11-background-task-visibility)
12. [Data Validation & Reliability](#12-data-validation--reliability)
13. [Refactor Steps (In Order)](#13-refactor-steps-in-order)
14. [File-by-File Responsibilities](#14-file-by-file-responsibilities)
15. [Verification Checklist](#15-verification-checklist)
16. [Future Scaling](#16-future-scaling)

---

## 1. What's Wrong With the Current Code

Before designing the solution, here is an honest audit of every problem in the current codebase.

### Problem 1 — The Frontend Reads a Static JSON File

The frontend fetches `data.json`, a plain file sitting in the `public/` folder.
This means:
- Every pipeline run regenerates the entire file (slow, brittle)
- You cannot filter, sort, or paginate at the database level
- The file has to be loaded completely into memory in the browser (1,430 rows × all fields)
- It cannot support multi-year data without becoming enormous

**Fix:** The frontend should call a real API (`/api/holdings`) and receive only the data it needs.

---

### Problem 2 — The Database Has One Flat Table

`financial_metrics` has one row per ticker, which gets replaced on every fetch.
This means:
- All historical metric data is permanently lost every time you re-fetch
- You cannot see how P/E, price, or ownership changed over time
- You cannot ask "what were Apple's metrics 6 months ago?"

**Fix:** Store every fetch as a new snapshot row with a timestamp. Query the latest when you need it.

---

### Problem 3 — CSV Files Are Both Storage AND Transfer Format

Currently:
- `fully_cleaned_dataset_with_reasons.csv` — intermediate processing result
- `holdings_with_tickers.csv` — another intermediate result
- `mega_portfolio_dataset.csv` — the final merged output that the frontend reads

None of these belong as permanent files. They are generated outputs. If you delete the database and re-run, you want everything to rebuild from source automatically. Instead, they are fragile hand-offs between pipeline steps that can go out of sync.

**Fix:** Pipeline steps communicate through the database, not CSV files.

---

### Problem 4 — Paths Are Hardcoded Everywhere

Every pipeline file calculates its own path like:
```python
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATA_DIR = BACKEND_DIR.parent / "data"
```
This is repeated in every file. If you move one file, every path breaks.

**Fix:** One `config.py` file with all paths. Every other file imports from it.

---

### Problem 5 — The Charts Are Fake

`genSeries()` in `charts.jsx` generates fake numbers seeded from the ticker name.
NVDA's "price history" has nothing to do with NVIDIA's real price.

**Fix:** Store real yfinance daily price history in SQLite. Serve it via `/api/spark/{ticker}`.

---

### Problem 6 — No Logging, No Audit Trail

When a pipeline run fails halfway through, you have no way to know:
- How many tickers were fetched successfully?
- Which ones failed and why?
- Did the merge complete?
- When was data last updated?

**Fix:** A `pipeline_runs` table logs every run with start time, end time, row counts, and errors.

---

### Problem 7 — The Rate Limiter is a JSON File

`rate_limits.json` tracks how many metrics runs happened today. This works for now but:
- It can get out of sync
- It lives outside the database for no reason
- It cannot track per-step progress

**Fix:** Move run tracking into the `pipeline_runs` database table.

---

### Problem 8 — No Multi-Year Support

The code assumes one snapshot of NBIM data (2024). There is no concept of year attached to holdings.

**Fix:** Add a `year` column to holdings tables. The import pipeline takes a year argument.

---

## 2. The Big Picture — Ideal Architecture

Here is the architecture you are building toward:

```
┌─────────────────────────────────────────────────────────┐
│                     DATA SOURCES                        │
│  NBIM Website (CSV download)   Yahoo Finance (yfinance) │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
               ▼                           ▼
┌─────────────────────────────────────────────────────────┐
│                   PIPELINE LAYER                        │
│  fetch_holdings.py   fetch_metrics.py   fetch_history.py│
│         (scrape)        (yfinance)         (yfinance)   │
└───────────────────────────┬─────────────────────────────┘
                            │ writes to
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   SQLite DATABASE                       │
│  companies  │  yearly_holdings  │  metrics_snapshots    │
│  price_history  │  pipeline_runs  │  import_logs        │
└───────────────────────────┬─────────────────────────────┘
                            │ reads from
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   BACKEND API (FastAPI)                 │
│  /api/holdings  /api/company/{ticker}  /api/spark/{t}  │
│  /api/pipeline/status  /api/compare-years  /api/health  │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP fetch()
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (React)                      │
│  Table  │  Detail Drawer  │  Charts  │  Pipeline Panel  │
└─────────────────────────────────────────────────────────┘
```

**The single source of truth is the SQLite database.**
No CSV file is ever read by the API or the frontend. CSV is only used as the raw import format
for NBIM data that comes from the website.

---

## 3. Proposed Folder Structure

```
nbim-tracker/
│
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app creation + middleware
│   │   ├── config.py            # ALL paths and constants (one file)
│   │   ├── database.py          # DB connection, get_db() helper
│   │   ├── routes/
│   │   │   ├── holdings.py      # GET /api/holdings, /api/company/{ticker}
│   │   │   ├── pipeline.py      # POST /api/pipeline/*, GET /api/pipeline/status
│   │   │   ├── spark.py         # GET /api/spark/{ticker}
│   │   │   ├── compare.py       # GET /api/compare-years
│   │   │   └── health.py        # GET /api/health
│   │   └── services/
│   │       ├── holdings_service.py   # Query logic for holdings
│   │       ├── metrics_service.py    # Query logic for metrics
│   │       ├── spark_service.py      # Query + aggregate price history
│   │       └── pipeline_service.py   # Run tracking + rate limiting
│   │
│   ├── pipeline/
│   │   ├── runner.py            # Orchestrates all pipeline steps
│   │   ├── fetch_holdings.py    # Step 1: Scrape NBIM CSV
│   │   ├── map_tickers.py       # Step 2: Map ISIN → Yahoo ticker
│   │   ├── fetch_metrics.py     # Step 3: Yahoo Finance metrics
│   │   └── fetch_history.py     # Step 4: Daily price history
│   │
│   ├── utils/
│   │   ├── logger.py            # Colored terminal logging
│   │   └── validators.py        # Data validation functions
│   │
│   ├── migrations/
│   │   └── 001_initial_schema.sql   # Full DB schema in one file
│   │
│   └── nbim.db                  # The database (never commit this)
│
├── data/
│   ├── imports/                 # Raw NBIM CSVs — read-only, never modified
│   │   └── nbim_equity_2024.csv
│   └── ticker_map.csv           # Hand-maintained ISIN → Yahoo ticker mapping
│
├── frontend/
│   └── public/
│       ├── index.html           # Loads React + Babel + all JSX files
│       ├── favicon.svg
│       └── src/
│           ├── app.jsx          # Root component + data fetching from API
│           ├── api.js           # All fetch() calls in one place
│           ├── charts.jsx       # SVG chart components (real data)
│           ├── table.jsx        # Holdings ledger table
│           ├── detail.jsx       # Company drawer (uses /api/spark/{t})
│           ├── summary.jsx      # Stats bar (top holdings, sector donut)
│           ├── filters.jsx      # Filter bar component
│           ├── compare.jsx      # Multi-company comparison modal
│           ├── topbar.jsx       # Search + nav bar
│           ├── pipeline.jsx     # Pipeline control panel
│           └── format.jsx       # Number formatting utilities
│
├── ARCHITECTURE.md              # This file
├── PROJECT_AUDIT.md
└── .gitignore
```

### Why this structure?

- **`routes/`** — Each API endpoint group is in its own file. When you need to change the holdings API, you open `holdings.py`. You don't dig through a 300-line `main.py`.
- **`services/`** — Business logic (e.g., "get latest metrics for a ticker") is separated from the HTTP layer. Services can be tested independently.
- **`pipeline/`** — Data ingestion is completely separate from the API. The pipeline writes to the database; the API reads from it. They never call each other.
- **`utils/`** — Shared helpers that don't belong to any one layer.
- **`migrations/`** — The database schema is defined in one place, not scattered across `setup_database.py` calls.
- **`api.js`** (frontend) — Every `fetch()` call from the frontend is in one file. When the API URL changes, you change one line, not 6 files.

---

## 4. SQLite Explained Simply

### What is SQLite?

SQLite is a database that lives in a single file (your `nbim.db`). Unlike PostgreSQL or MySQL, there is no server to install or manage. Your Python code opens the file directly and runs SQL queries.

Think of it like a very powerful Excel workbook:
- Each **table** is a spreadsheet tab
- Each **row** is one record
- Each **column** is one field
- **SQL queries** let you filter, sort, join, and aggregate instantly

### Why SQLite is perfect for this project

| Need | SQLite solution |
|------|-----------------|
| Store 1,430 companies | Trivial — handles millions of rows |
| Query "top 50 by market value" | `ORDER BY market_value_nok DESC LIMIT 50` |
| Store 3 years of metrics snapshots | Just rows with a `year` column |
| Store 1 year of daily price history for 1,430 tickers | ~520,000 rows — fast |
| Filter by sector, country, year simultaneously | One SQL `WHERE` clause |
| Never lose historical data | `INSERT OR IGNORE` — only inserts new rows |

### When does SQLite NOT work?

- Multiple users writing at the same time (use PostgreSQL instead)
- Terabytes of data (use a cloud database)
- This project never hits either limit

---

## 5. CSV vs SQLite — Clear Decision

Here is the final decision on every file type in the project:

| File | Role | Keep? |
|------|------|-------|
| `data/imports/nbim_equity_2024.csv` | Raw source from NBIM website | YES — raw archive, never modified |
| `data/ticker_map.csv` | Hand-curated ISIN → ticker mapping | YES — source of truth for ticker mapping |
| `data/holdings_with_tickers.csv` | Generated intermediate | **DELETE** — regenerate from DB |
| `data/fully_cleaned_dataset_with_reasons.csv` | Generated intermediate | **DELETE** — regenerate from DB |
| `data/mega_portfolio_dataset.csv` | Generated final output | **DELETE** — frontend reads API, not CSV |
| `frontend/public/data.json` | Static frontend data dump | **DELETE** — frontend reads API |
| `backend/nbim.db` | The database | YES — single source of truth |

### The Rule

```
CSV in  →  Database stores  →  API serves  →  Frontend displays
(import)     (permanent)       (on demand)      (in browser)
```

CSV files are **input only**. Once data is in the database, CSV files are no longer needed for anything except raw archival. The frontend never reads a file directly — it always calls the API.

---

## 6. Database Schema Design

This is the proposed schema. Every table is explained in plain English.

```sql
-- ═══════════════════════════════════════════════════════════
-- TABLE: companies
-- The master registry of every company we have ever tracked.
-- A company is added the first time it appears in an NBIM import.
-- It is never deleted even if it drops out of the fund.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE companies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    yahoo_ticker TEXT    UNIQUE NOT NULL,
    name         TEXT    NOT NULL,
    isin         TEXT,           -- International securities identifier
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Index: fast lookup by ticker (used on every API call)
CREATE INDEX idx_companies_ticker ON companies(yahoo_ticker);


-- ═══════════════════════════════════════════════════════════
-- TABLE: yearly_holdings
-- NBIM's actual fund holdings for a given year.
-- Each company can have one row per year.
-- The market_value_nok is the fund's position size.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE yearly_holdings (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id        INTEGER NOT NULL REFERENCES companies(id),
    year              INTEGER NOT NULL,
    country           TEXT,
    industry          TEXT,
    market_value_nok  REAL,
    market_value_usd  REAL,
    ownership_pct     REAL,
    voting_pct        REAL,
    selection_reason  TEXT,   -- 'Ownership', 'Market Value', or 'Both'
    imported_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, year)  -- one row per company per year
);
CREATE INDEX idx_holdings_year    ON yearly_holdings(year);
CREATE INDEX idx_holdings_company ON yearly_holdings(company_id);


-- ═══════════════════════════════════════════════════════════
-- TABLE: metrics_snapshots
-- Yahoo Finance metrics fetched on a given date.
-- We keep EVERY snapshot — never overwrite.
-- This gives you a history of how P/E, price, etc. changed.
-- The UNIQUE constraint prevents double-fetching on the same day.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE metrics_snapshots (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id              INTEGER NOT NULL REFERENCES companies(id),
    fetched_at              DATETIME NOT NULL,
    pe_ratio                REAL,
    forward_pe              REAL,
    price_to_book           REAL,
    dividend_yield          REAL,
    market_cap              REAL,
    analyst_recommendation  TEXT,
    target_mean_price       REAL,
    beta                    REAL,
    sector                  TEXT,
    industry_yf             TEXT,
    price                   REAL,
    change_pct              REAL,
    high_52w                REAL,
    low_52w                 REAL,
    UNIQUE(company_id, DATE(fetched_at))  -- one per company per calendar day
);
CREATE INDEX idx_metrics_company  ON metrics_snapshots(company_id);
CREATE INDEX idx_metrics_date     ON metrics_snapshots(DATE(fetched_at));


-- ═══════════════════════════════════════════════════════════
-- TABLE: price_history
-- Daily OHLCV (open/high/low/close/volume) price data.
-- Fetched from yfinance. One row per company per day.
-- UNIQUE prevents inserting the same day twice on re-runs.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE price_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    date       DATE    NOT NULL,
    open       REAL,
    high       REAL,
    low        REAL,
    close      REAL,
    volume     INTEGER,
    UNIQUE(company_id, date)
);
CREATE INDEX idx_price_company ON price_history(company_id);
CREATE INDEX idx_price_date    ON price_history(date);


-- ═══════════════════════════════════════════════════════════
-- TABLE: pipeline_runs
-- Every time a pipeline step runs, one row is written here.
-- This gives you a full audit trail of what happened and when.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE pipeline_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_type        TEXT    NOT NULL,   -- 'import_holdings','fetch_metrics','fetch_history'
    status          TEXT    NOT NULL DEFAULT 'running',  -- 'running','success','error'
    year            INTEGER,            -- for import_holdings runs
    started_at      DATETIME NOT NULL,
    completed_at    DATETIME,
    rows_processed  INTEGER DEFAULT 0,
    rows_inserted   INTEGER DEFAULT 0,
    rows_updated    INTEGER DEFAULT 0,
    rows_failed     INTEGER DEFAULT 0,
    error_message   TEXT,
    triggered_by    TEXT DEFAULT 'ui'  -- 'ui', 'cli', 'schedule'
);


-- ═══════════════════════════════════════════════════════════
-- TABLE: import_logs
-- Row-level log for each company during a pipeline run.
-- Lets you audit: "was NVDA successfully imported on May 26?"
-- ═══════════════════════════════════════════════════════════
CREATE TABLE import_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          INTEGER NOT NULL REFERENCES pipeline_runs(id),
    ticker          TEXT,
    action          TEXT,   -- 'inserted', 'updated', 'skipped', 'error'
    message         TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_import_run ON import_logs(run_id);
```

### Understanding the Relationships

```
companies
   │
   ├──< yearly_holdings    (one company, many years of holdings)
   ├──< metrics_snapshots  (one company, many daily metric snapshots)
   ├──< price_history      (one company, many daily prices)
   └──< import_logs        (via pipeline_runs, audit trail)
```

### What is a Foreign Key?

`company_id INTEGER REFERENCES companies(id)` means: the value in `company_id`
must match an existing `id` in the `companies` table. This prevents orphaned data
(e.g., a price record for a company that doesn't exist).

### What is an Index?

An index is a lookup shortcut. Without one, querying `WHERE company_id = 42` scans
every row. With an index, SQLite jumps directly to matching rows. Always add indexes
on columns you filter or join by.

---

## 7. Data Flow — End to End

### Step 1 — Import Holdings (runs ~once per year)

```
NBIM website
    │
    ▼ (Playwright browser automation)
Raw CSV file  →  saved to data/imports/nbim_equity_{year}.csv
    │
    ▼ (fetch_holdings.py)
Apply country/industry filters
Map companies to Yahoo tickers (using ticker_map.csv)
    │
    ▼ (writes to SQLite)
INSERT into companies (new companies only)
INSERT OR REPLACE into yearly_holdings (year=2024)
INSERT into pipeline_runs (type='import_holdings', status='success')
```

### Step 2 — Fetch Metrics (runs up to 2× per day)

```
companies table (all tickers)
    │
    ▼ (fetch_metrics.py, batches of 20)
yf.Tickers(batch).info for each ticker
    │
    ▼ (writes to SQLite)
INSERT OR IGNORE into metrics_snapshots
  (UNIQUE on company_id + DATE — skips if already fetched today)
INSERT into pipeline_runs (type='fetch_metrics')
```

### Step 3 — Fetch Price History (runs after metrics)

```
companies table (all tickers)
    │
    ▼ (fetch_history.py)
yf.Ticker(t).history(period="6mo") for each ticker
    │
    ▼ (writes to SQLite)
INSERT OR IGNORE into price_history
  (UNIQUE on company_id + date — never overwrites, only adds new days)
```

### How the Frontend Gets Data

```
Browser opens app
    │
    ▼ fetch('/api/holdings?page=1&limit=50&sort=mvNok')
    │
FastAPI routes/holdings.py
    │
    ▼ services/holdings_service.py
SELECT yh.*, c.yahoo_ticker, c.name, ms.price, ms.pe_ratio, ...
FROM yearly_holdings yh
JOIN companies c ON c.id = yh.company_id
LEFT JOIN metrics_snapshots ms ON ms.company_id = yh.company_id
  AND ms.fetched_at = (
    SELECT MAX(fetched_at) FROM metrics_snapshots
    WHERE company_id = yh.company_id
  )
WHERE yh.year = 2024
ORDER BY yh.market_value_nok DESC
LIMIT 50 OFFSET 0
    │
    ▼ JSON response
[{ name, ticker, price, pe_ratio, market_value_nok, ... }, ...]
    │
    ▼ React sets state → table renders
```

**Notice:** The frontend never reads a file. It asks the API, the API asks the database,
the database responds instantly.

---

## 8. API Architecture

### Complete API Surface

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/holdings` | Paginated, filterable, sortable holdings list |
| GET | `/api/company/{ticker}` | Single company with all metrics history |
| GET | `/api/spark/{ticker}` | Price history for charts (last N days) |
| GET | `/api/compare-years` | Side-by-side year comparison |
| GET | `/api/sectors` | Sector breakdown with aggregated values |
| GET | `/api/pipeline/status` | Current job status + progress |
| GET | `/api/pipeline/history` | Last N pipeline run logs |
| POST | `/api/pipeline/import-holdings` | Trigger Step 1 |
| POST | `/api/pipeline/fetch-metrics` | Trigger Step 2 |
| POST | `/api/pipeline/fetch-history` | Trigger Step 3 |
| GET | `/api/health` | Database integrity + last update time |

### Example: `/api/holdings` Request Flow

**Request:**
```
GET /api/holdings?page=1&limit=50&year=2024&sector=Technology&sort=mvNok&dir=desc
```

**Response:**
```json
{
  "data": [
    {
      "ticker": "NVDA",
      "name": "NVIDIA Corp",
      "country": "United States",
      "sector": "Technology",
      "market_value_nok": 573855187060,
      "market_value_usd": 56980000000,
      "ownership_pct": 1.26,
      "price": 214.86,
      "change_pct": -0.218,
      "pe_ratio": 32.95,
      "high_52w": 236.54,
      "low_52w": 132.92,
      "analyst_recommendation": "strong_buy",
      "metrics_as_of": "2026-05-26"
    }
  ],
  "meta": {
    "total": 423,
    "page": 1,
    "limit": 50,
    "year": 2024
  }
}
```

### Why Pagination Matters

Currently the frontend loads all 1,430 companies at once. With:
- Multiple years: 1,430 × 3 = 4,290 rows
- Historical metrics: 4,290 × 365 rows

Loading everything at once becomes slow. Pagination (`LIMIT 50 OFFSET 0`) means
the API only returns 50 rows per request, and the frontend requests the next page
as the user scrolls.

---

## 9. Real Historical Charts

### Current Problem

`genSeries()` in `charts.jsx` generates fake numbers. The code is:
```javascript
// Deterministic synthetic price series for a ticker (used in detail view)
function genSeries(seed, n = 60, base = 100, vol = 0.02) { ... }
```
This must be replaced with real data.

### Step 1 — Store Real Prices During Fetch

In `fetch_history.py`:
```python
import yfinance as yf

ticker = yf.Ticker("NVDA")
hist = ticker.history(period="6mo")  # 6 months of daily data

# hist is a DataFrame with columns: Open, High, Low, Close, Volume
# Index is dates

for date, row in hist.iterrows():
    cursor.execute("""
        INSERT OR IGNORE INTO price_history
        (company_id, date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (company_id, date.date().isoformat(),
          row['Open'], row['High'], row['Low'], row['Close'], int(row['Volume'])))
```

`INSERT OR IGNORE` means: if a row for this company + date already exists, skip it.
This means re-running the fetch never corrupts existing history — it only adds new days.

### Step 2 — Serve via API

`GET /api/spark/{ticker}?days=90`

```python
@router.get("/spark/{ticker}")
def get_spark(ticker: str, days: int = 90, db = Depends(get_db)):
    company = db.execute(
        "SELECT id FROM companies WHERE yahoo_ticker = ?", (ticker,)
    ).fetchone()
    if not company:
        raise HTTPException(404)

    rows = db.execute("""
        SELECT date, close
        FROM price_history
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT ?
    """, (company["id"], days)).fetchall()

    # Return in chronological order (oldest first for chart rendering)
    return {
        "ticker": ticker,
        "points": [{"date": r["date"], "close": r["close"]} for r in reversed(rows)]
    }
```

### Step 3 — Frontend Uses Real Data

In `detail.jsx`, replace the `genSeries()` call:

```javascript
// OLD (fake):
const series = React.useMemo(() => genSeries(company.ticker, 120, base, vol), [company.ticker]);

// NEW (real):
const [series, setSeries] = React.useState([]);
React.useEffect(() => {
    fetch(`/api/spark/${company.ticker}?days=90`)
        .then(r => r.json())
        .then(d => setSeries(d.points.map(p => p.close)));
}, [company.ticker]);
```

### Why This Approach is Powerful Long-Term

Every time you run the pipeline, new days are appended. After one year of running,
you will have a complete year of price history for every company — stored locally,
no external API subscription needed. After two years, two years of history. The
database becomes more valuable over time.

---

## 10. Multi-Year Dataset Support

### The Design

The `yearly_holdings` table stores NBIM's position in each company for each year.
The `year` column is the key that makes this work.

```sql
-- NBIM added NVDA in 2023, it was there in 2024 too:
SELECT year, market_value_nok, ownership_pct
FROM yearly_holdings yh
JOIN companies c ON c.id = yh.company_id
WHERE c.yahoo_ticker = 'NVDA'
ORDER BY year;

-- Result:
-- year | market_value_nok | ownership_pct
-- 2023 | 280000000000     | 0.89
-- 2024 | 573855187060     | 1.26
```

### Comparing Years

`GET /api/compare-years?years=2023,2024`

```python
# Returns:
{
  "added": [   # companies in 2024 but not 2023
    { "ticker": "AVGO", "name": "Broadcom Inc", "market_value_usd": 21400000000 }
  ],
  "removed": [ # companies in 2023 but not 2024
    { "ticker": "XYZ", "name": "Some Corp" }
  ],
  "changed": [ # companies in both years with notable changes
    {
      "ticker": "NVDA",
      "name": "NVIDIA Corp",
      "ownership_2023": 0.89,
      "ownership_2024": 1.26,
      "mv_change_pct": +104.8
    }
  ]
}
```

### Importing a New Year

The pipeline takes a year argument:
```bash
python pipeline/fetch_holdings.py --year 2025
```

This fetches 2025 data from NBIM, runs the same filters, and inserts new rows into
`yearly_holdings` with `year=2025`. All existing data is untouched. The 2024 data
is still there for comparison.

---

## 11. Background Task Visibility

### Terminal Logging (Colored + Structured)

Create `backend/utils/logger.py`:

```python
import logging, sys
from datetime import datetime

RESET  = "\033[0m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
CYAN   = "\033[36m"
BOLD   = "\033[1m"
DIM    = "\033[2m"

class PipelineLogger:
    def __init__(self, run_type: str):
        self.run_type = run_type
        self.start = datetime.now()
        self.counts = {"inserted": 0, "updated": 0, "skipped": 0, "failed": 0}

    def step(self, message: str):
        elapsed = (datetime.now() - self.start).seconds
        print(f"{CYAN}[{elapsed:>4}s]{RESET} {BOLD}{message}{RESET}", flush=True)

    def success(self, ticker: str, action: str = "saved"):
        self.counts["inserted"] += 1
        print(f"  {GREEN}✓{RESET} {ticker} — {action}", flush=True)

    def skip(self, ticker: str, reason: str = "already exists"):
        self.counts["skipped"] += 1
        print(f"  {DIM}○ {ticker} — {reason}{RESET}", flush=True)

    def error(self, ticker: str, message: str):
        self.counts["failed"] += 1
        print(f"  {RED}✗ {ticker} — {message}{RESET}", flush=True)

    def summary(self):
        elapsed = (datetime.now() - self.start).seconds
        print(f"\n{BOLD}{'═'*50}{RESET}")
        print(f"{BOLD}{self.run_type} completed in {elapsed}s{RESET}")
        print(f"  {GREEN}Inserted: {self.counts['inserted']}{RESET}")
        print(f"  {YELLOW}Skipped:  {self.counts['skipped']}{RESET}")
        print(f"  {RED}Failed:   {self.counts['failed']}{RESET}")
        print(f"{BOLD}{'═'*50}{RESET}\n")
```

### Frontend Progress (What to Add)

The pipeline panel already shows progress. Add these improvements:

1. **Last updated timestamp** — show "Metrics last fetched: 2 hours ago" using `pipeline_runs.completed_at`
2. **Per-step progress** — break 0–100% into labeled phases: "Fetching [42/72 batches]"
3. **Error detail** — if a run fails, show the error message from `pipeline_runs.error_message`
4. **Run history** — last 5 runs with their status and row counts from `pipeline_runs`

---

## 12. Data Validation & Reliability

### Validation Layer (`utils/validators.py`)

```python
def validate_holding_row(row: dict) -> list[str]:
    """Returns a list of validation errors. Empty list = valid."""
    errors = []
    if not row.get("Name"):
        errors.append("Missing company name")
    if not row.get("Yahoo_Ticker"):
        errors.append("Missing ticker")
    if row.get("Market Value(NOK)", 0) <= 0:
        errors.append(f"Invalid market value: {row.get('Market Value(NOK)')}")
    if not 0 <= float(row.get("Ownership", 0)) <= 100:
        errors.append(f"Ownership out of range: {row.get('Ownership')}")
    return errors
```

### Import Summary (After Every Run)

```
══════════════════════════════════════════════════════
import_holdings completed in 12s  [year=2024]
  Processed:  1,521 raw rows
  After filter: 1,430 rows
  Companies inserted (new): 23
  Holdings inserted: 1,430
  Holdings updated:  0
  Validation errors: 3
    - Row 145: Missing ticker (Aegis Vopak Terminals Ltd)
    - Row 892: Ownership out of range: 101.2
    - Row 1203: Missing company name
══════════════════════════════════════════════════════
```

### Database Integrity Checks (`GET /api/health`)

```python
@router.get("/health")
def health_check(db = Depends(get_db)):
    checks = {}

    # 1. Count companies
    checks["total_companies"] = db.execute("SELECT COUNT(*) FROM companies").fetchone()[0]

    # 2. Count holdings per year
    rows = db.execute("SELECT year, COUNT(*) FROM yearly_holdings GROUP BY year").fetchall()
    checks["holdings_by_year"] = {r[0]: r[1] for r in rows}

    # 3. Latest metrics fetch
    latest = db.execute("SELECT MAX(fetched_at) FROM metrics_snapshots").fetchone()[0]
    checks["latest_metrics_fetch"] = latest

    # 4. Price history coverage
    checks["price_history_days"] = db.execute(
        "SELECT COUNT(DISTINCT date) FROM price_history"
    ).fetchone()[0]

    # 5. Companies with NO metrics
    checks["companies_without_metrics"] = db.execute("""
        SELECT COUNT(*) FROM companies c
        WHERE NOT EXISTS (
            SELECT 1 FROM metrics_snapshots m WHERE m.company_id = c.id
        )
    """).fetchone()[0]

    # 6. Duplicate check
    checks["duplicate_holdings"] = db.execute("""
        SELECT COUNT(*) FROM (
            SELECT company_id, year, COUNT(*) as cnt
            FROM yearly_holdings GROUP BY company_id, year HAVING cnt > 1
        )
    """).fetchone()[0]

    return checks
```

---

## 13. Refactor Steps (In Order)

Work through these phases in order. Each phase leaves the app working.

### Phase 1 — Foundation (do this first, nothing breaks)

- [ ] Create `backend/app/config.py` with all paths
- [ ] Create `backend/migrations/001_initial_schema.sql` with the full schema
- [ ] Create `backend/utils/logger.py` with `PipelineLogger`
- [ ] Write a migration runner that applies the schema to a fresh `nbim.db`

### Phase 2 — Database Normalization

- [ ] Create the `companies` table
- [ ] Create the `yearly_holdings` table
- [ ] Write a migration script that reads the current `enriched_holdings` table
  and populates the new normalized tables (one-time migration)
- [ ] Verify: `SELECT COUNT(*) FROM companies` = 1,430

### Phase 3 — Metrics Refactor

- [ ] Create `metrics_snapshots` table
- [ ] Update `fetch_metrics.py` to write to `metrics_snapshots` instead of `financial_metrics`
- [ ] Add `INSERT OR IGNORE` deduplication (one snapshot per ticker per day)
- [ ] Delete `financial_metrics` table after migration confirmed

### Phase 4 — API Layer

- [ ] Create `backend/app/routes/holdings.py` with `/api/holdings`
- [ ] Create `backend/app/services/holdings_service.py` with the join query
- [ ] Update `app.jsx` to call `/api/holdings` instead of reading `data.json`
- [ ] Delete `data/mega_portfolio_dataset.csv` and `frontend/public/data.json`
- [ ] Verify: frontend still shows 1,430 companies from the API

### Phase 5 — Real Charts

- [ ] Create `price_history` table
- [ ] Create `backend/pipeline/fetch_history.py`
- [ ] Create `backend/app/routes/spark.py` with `/api/spark/{ticker}`
- [ ] Update `detail.jsx` to fetch from `/api/spark/{ticker}` instead of `genSeries()`
- [ ] Verify: NVDA chart shows real historical prices

### Phase 6 — Pipeline Logging

- [ ] Create `pipeline_runs` and `import_logs` tables
- [ ] Update all pipeline scripts to write run records
- [ ] Update `/api/pipeline/status` to read from `pipeline_runs`
- [ ] Add run history display to pipeline panel in frontend
- [ ] Remove `rate_limits.json` (use `pipeline_runs` table instead)

### Phase 7 — Multi-Year Support

- [ ] Add `year` parameter to holdings import pipeline
- [ ] Create `/api/compare-years` endpoint
- [ ] Import 2023 data alongside 2024 (if available)
- [ ] Add year selector to frontend filters

### Phase 8 — Documentation & Cleanup

- [ ] Delete all now-unused CSV output files
- [ ] Delete `setup_database.py` (replaced by migrations)
- [ ] Delete `merge_and_enrich.py` (replaced by API join query)
- [ ] Run full verification checklist

---

## 14. File-by-File Responsibilities

### Backend

| File | Responsibility | Should NOT do |
|------|----------------|---------------|
| `config.py` | Paths, constants | Any logic |
| `database.py` | Open DB connection, return cursor | SQL queries |
| `main.py` | Create FastAPI app, register routers | Business logic |
| `routes/holdings.py` | Parse HTTP params, call service, return JSON | SQL queries |
| `services/holdings_service.py` | Build and run the SQL query | HTTP concerns |
| `pipeline/fetch_holdings.py` | Scrape NBIM, filter, write to DB | Serve data |
| `pipeline/fetch_metrics.py` | Call yfinance, write snapshots | Serve data |
| `pipeline/fetch_history.py` | Call yfinance history, write prices | Serve data |
| `utils/logger.py` | Print colored logs | Query DB |
| `utils/validators.py` | Validate row data | Write to DB |

### Frontend

| File | Responsibility | Should NOT do |
|------|----------------|---------------|
| `api.js` | All `fetch()` calls to the backend | Render UI |
| `app.jsx` | State management, layout, data loading | Formatting logic |
| `table.jsx` | Render the holdings table | Fetch data |
| `detail.jsx` | Render the company drawer | Business logic |
| `charts.jsx` | SVG chart components | Fetch data |
| `filters.jsx` | Filter bar UI | Filter the data itself |
| `format.jsx` | Number/currency formatting | Render UI |
| `pipeline.jsx` | Pipeline control panel | Trigger pipeline directly |
| `compare.jsx` | Multi-company comparison modal | Fetch data |

---

## 15. Verification Checklist

Run through this after any significant change.

### Database checks
```bash
# Open the database
sqlite3 backend/nbim.db

# 1. Check row counts
SELECT 'companies', COUNT(*) FROM companies
UNION SELECT 'yearly_holdings', COUNT(*) FROM yearly_holdings
UNION SELECT 'metrics_snapshots', COUNT(*) FROM metrics_snapshots
UNION SELECT 'price_history', COUNT(*) FROM price_history;

# 2. Check for duplicates in holdings
SELECT company_id, year, COUNT(*) as cnt
FROM yearly_holdings GROUP BY company_id, year HAVING cnt > 1;
-- Should return: 0 rows

# 3. Check metrics coverage
SELECT COUNT(DISTINCT company_id) FROM metrics_snapshots;
-- Should be close to total companies

# 4. Check latest fetch date
SELECT DATE(MAX(fetched_at)) FROM metrics_snapshots;
-- Should be today or recent

# 5. Check price history range
SELECT MIN(date), MAX(date), COUNT(DISTINCT date) FROM price_history;
```

### API checks
```bash
# Holdings API returns expected count
curl -s http://localhost:8000/api/holdings | python3 -c "
import json, sys; d=json.load(sys.stdin)
print('Total companies:', d['meta']['total'])
print('First row:', d['data'][0]['name'], d['data'][0]['price'])
"

# Spark returns real prices
curl -s http://localhost:8000/api/spark/NVDA?days=30 | python3 -c "
import json, sys; d=json.load(sys.stdin)
print('Days of history:', len(d['points']))
print('First close:', d['points'][0])
"

# Health check
curl -s http://localhost:8000/api/health | python3 -m json.tool
```

### Sorting correctness
```python
# Verify top 5 by market value match what you expect
import sqlite3
conn = sqlite3.connect("backend/nbim.db")
rows = conn.execute("""
    SELECT c.name, yh.market_value_nok
    FROM yearly_holdings yh JOIN companies c ON c.id = yh.company_id
    WHERE yh.year = 2024
    ORDER BY yh.market_value_nok DESC LIMIT 5
""").fetchall()
for r in rows: print(f"{r[0]:40s}  kr {r[1]/1e9:.1f}B")
```

---

## 16. Future Scaling

### More Years

The schema already supports this. Just import each year and compare.
If NBIM starts publishing quarterly data, add a `quarter` column to `yearly_holdings`.

### More Data Sources

Want to add Bloomberg data? Create a new pipeline script and a new table.
The `companies` table acts as the central registry — any data source links to it via `company_id`.

### Bigger Universe

Currently tracks ~1,430 filtered companies. The full NBIM fund has 8,000+.
To track all: remove the country/industry filters from `fetch_holdings.py`.
The schema handles any size.

### Scheduled Runs

Instead of manually clicking "Fetch Metrics", add a scheduled job:
```python
# Using APScheduler (add to main.py)
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()
scheduler.add_job(fetch_metrics_job, 'cron', hour=7, minute=0)  # every day at 7am
scheduler.start()
```

### Moving to PostgreSQL Later

If this ever needs to support multiple users or be deployed to a server:
- The SQL queries are standard and mostly portable
- The main change is replacing `sqlite3.connect()` with `psycopg2` or SQLAlchemy
- The schema needs minor adjustments (e.g., `AUTOINCREMENT` → `SERIAL`)

The architecture is designed so that swapping the database requires changing
only `database.py` and the connection string in `config.py`.

---

## Quick Reference: Common Queries

```sql
-- Latest metrics for one ticker
SELECT ms.*
FROM metrics_snapshots ms
JOIN companies c ON c.id = ms.company_id
WHERE c.yahoo_ticker = 'NVDA'
ORDER BY ms.fetched_at DESC LIMIT 1;

-- Top 10 holdings by market value for 2024
SELECT c.name, c.yahoo_ticker, yh.market_value_nok, yh.ownership_pct
FROM yearly_holdings yh
JOIN companies c ON c.id = yh.company_id
WHERE yh.year = 2024
ORDER BY yh.market_value_nok DESC LIMIT 10;

-- Companies added between 2023 and 2024
SELECT c.name, c.yahoo_ticker
FROM companies c
WHERE EXISTS (SELECT 1 FROM yearly_holdings WHERE company_id=c.id AND year=2024)
  AND NOT EXISTS (SELECT 1 FROM yearly_holdings WHERE company_id=c.id AND year=2023);

-- Price history for NVDA, last 30 days
SELECT ph.date, ph.close
FROM price_history ph
JOIN companies c ON c.id = ph.company_id
WHERE c.yahoo_ticker = 'NVDA'
ORDER BY ph.date DESC LIMIT 30;

-- Pipeline run history
SELECT run_type, status, started_at, rows_inserted, error_message
FROM pipeline_runs
ORDER BY started_at DESC LIMIT 10;
```

---

*Last updated: May 2026*
