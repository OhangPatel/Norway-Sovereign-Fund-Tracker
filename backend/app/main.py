from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import sqlite3
from pathlib import Path
import json
import subprocess
import sys
import os
import threading
from datetime import datetime, date, timedelta, timezone
import yfinance as yf

app = FastAPI(title="NBIM Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:8080", "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = Path(__file__).resolve().parent.parent / "nbim.db"
PIPELINE_DIR = Path(__file__).resolve().parent.parent / "pipeline"
RATE_LIMIT_FILE = Path(__file__).resolve().parent / "rate_limits.json"
MAX_METRICS_RUNS_PER_DAY = 2

# ── Pipeline state ────────────────────────────────────────────────────────────
_lock = threading.Lock()
_status: dict = {
    "is_running": False,
    "job_type": None,
    "step": "",
    "progress": 0,
    "message": "Idle",
    "started_at": None,
    "completed_at": None,
    "error": None,
}


def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


# ── Rate-limit helpers ────────────────────────────────────────────────────────
def _load_rate_limits() -> dict:
    if RATE_LIMIT_FILE.exists():
        try:
            data = json.loads(RATE_LIMIT_FILE.read_text())
            if isinstance(data, dict):
                data.setdefault("metrics_merge_runs", [])
                return data
        except (json.JSONDecodeError, OSError):
            pass
    return {"metrics_merge_runs": []}


def _save_rate_limits(data: dict):
    RATE_LIMIT_FILE.write_text(json.dumps(data, indent=2))


def _count_today_metrics_runs() -> int:
    data = _load_rate_limits()
    today = date.today().isoformat()
    return sum(1 for r in data.get("metrics_merge_runs", []) if r.startswith(today))


def _record_metrics_run():
    data = _load_rate_limits()
    data["metrics_merge_runs"].append(datetime.now().isoformat())
    cutoff = (date.today() - timedelta(days=30)).isoformat()
    data["metrics_merge_runs"] = [r for r in data["metrics_merge_runs"] if r >= cutoff]
    _save_rate_limits(data)


# ── Subprocess runner with progress parsing ───────────────────────────────────
def _run_script(script_name: str, progress_offset: int = 0, progress_scale: float = 1.0) -> int:
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    process = subprocess.Popen(
        [sys.executable, "-u", str(PIPELINE_DIR / script_name)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
    )
    for raw in process.stdout:
        line = raw.strip()
        if not line:
            continue
        print(line, flush=True)
        if line.startswith("PROGRESS:"):
            try:
                cur, tot = line[9:].split("/")
                pct = int(int(cur) / int(tot) * 100 * progress_scale) + progress_offset
                _status["progress"] = min(pct, 99)
            except Exception:
                pass
        elif line.startswith("STEP:"):
            _status["step"] = line[5:].strip()
        else:
            _status["message"] = line
    process.wait()
    return process.returncode


# ── Worker threads ────────────────────────────────────────────────────────────
def _fetch_clean_worker():
    try:
        _status.update({
            "is_running": True,
            "job_type": "fetch_clean",
            "progress": 0,
            "step": "Launching browser...",
            "message": "Starting Playwright to scrape NBIM website",
            "error": None,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
        })
        ret = _run_script("fetch_and_clean_holding.py")
        if ret != 0:
            raise RuntimeError("fetch_and_clean_holding.py exited with non-zero status")
        _status.update({
            "is_running": False,
            "progress": 100,
            "step": "Done",
            "message": "Holdings data fetched and cleaned successfully!",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        _status.update({"is_running": False, "error": str(e), "message": f"Error: {e}"})
    finally:
        _lock.release()


def _metrics_merge_worker():
    try:
        _status.update({
            "is_running": True,
            "job_type": "metrics_merge",
            "progress": 0,
            "step": "Fetching Yahoo Finance metrics...",
            "message": "Starting yfinance batch fetcher — this takes 10-20 min",
            "error": None,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
        })
        _record_metrics_run()

        # Fetch metrics  (~88% of total time)
        ret = _run_script("fetch_yahoo_metrics.py", progress_offset=0, progress_scale=0.88)
        if ret != 0:
            raise RuntimeError("fetch_yahoo_metrics.py failed")

        # Merge (~12% of total time)
        _status.update({"step": "Merging data...", "progress": 90, "message": "Joining holdings with fresh metrics..."})
        ret = _run_script("merge_and_enrich.py", progress_offset=90, progress_scale=0.09)
        if ret != 0:
            raise RuntimeError("merge_and_enrich.py failed")

        _status.update({
            "is_running": False,
            "progress": 100,
            "step": "Done",
            "message": "Metrics fetched and data merged successfully!",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        _status.update({"is_running": False, "error": str(e), "message": f"Error: {e}"})
    finally:
        _lock.release()


# ── Pipeline endpoints ────────────────────────────────────────────────────────
@app.get("/api/pipeline/status")
def get_pipeline_status():
    today_runs = _count_today_metrics_runs()
    return {
        **_status,
        "rate_limit": {
            "metrics_runs_today": today_runs,
            "max_per_day": MAX_METRICS_RUNS_PER_DAY,
            "can_run": today_runs < MAX_METRICS_RUNS_PER_DAY and not _status["is_running"],
        },
    }


@app.post("/api/pipeline/fetch-clean")
def trigger_fetch_clean():
    if not _lock.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"error": "A pipeline job is already running"})
    threading.Thread(target=_fetch_clean_worker, daemon=True).start()
    return {"message": "Fetch & clean started"}


@app.post("/api/pipeline/metrics-merge")
def trigger_metrics_merge():
    today_runs = _count_today_metrics_runs()
    if today_runs >= MAX_METRICS_RUNS_PER_DAY:
        return JSONResponse(
            status_code=429,
            content={"error": f"Rate limit: max {MAX_METRICS_RUNS_PER_DAY} runs per day ({today_runs} used today)"},
        )
    if not _lock.acquire(blocking=False):
        return JSONResponse(status_code=409, content={"error": "A pipeline job is already running"})
    threading.Thread(target=_metrics_merge_worker, daemon=True).start()
    return {"message": "Metrics fetch & merge started"}


@app.post("/api/pipeline/ai-report")
def trigger_ai_report():
    return JSONResponse(
        status_code=501,
        content={"message": "AI report generation coming soon", "status": "not_implemented"},
    )


# ── Data endpoints ────────────────────────────────────────────────────────────
@app.get("/api/holdings")
def get_holdings(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
):
    conn = get_db_connection()
    cursor = conn.cursor()
    offset = (page - 1) * limit

    cursor.execute(
        "SELECT COUNT(DISTINCT Yahoo_Ticker) FROM enriched_holdings WHERE Yahoo_Ticker IS NOT NULL"
    )
    total_count = cursor.fetchone()[0]

    cursor.execute(
        """
        SELECT Name, Yahoo_Ticker, sector, Country AS country,
               pe_ratio, market_cap, high_52w, low_52w, fetched_at
        FROM enriched_holdings
        WHERE rowid IN (
            SELECT MIN(rowid)
            FROM enriched_holdings
            WHERE Yahoo_Ticker IS NOT NULL
            GROUP BY Yahoo_Ticker
        )
        ORDER BY market_cap DESC, Yahoo_Ticker
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    )
    rows = cursor.fetchall()
    conn.close()

    return {
        "data": [dict(row) for row in rows],
        "pagination": {
            "total_count": total_count,
            "current_page": page,
            "limit": limit,
            "total_pages": (total_count + limit - 1) // limit,
        },
    }


# Map each chart range to an interval that keeps the payload reasonable.
_HISTORY_RANGES = {"1y": "1d", "5y": "1wk", "max": "1mo"}


@app.get("/api/history/{ticker}")
def get_price_history(ticker: str, range: str = Query("1y")):
    """Live daily/weekly/monthly close prices from Yahoo. Fetched on demand,
    not stored — each request hits yfinance directly."""
    interval = _HISTORY_RANGES.get(range)
    if interval is None:
        return JSONResponse(
            status_code=400,
            content={"error": f"range must be one of {', '.join(_HISTORY_RANGES)}"},
        )

    try:
        hist = yf.Ticker(ticker).history(period=range, interval=interval)
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"Failed to fetch history: {e}"})

    if hist is None or hist.empty or "Close" not in hist:
        return JSONResponse(
            status_code=404,
            content={"error": "No price history available (invalid ticker or rate limited)"},
        )

    closes = hist["Close"].dropna()
    return {
        "ticker": ticker,
        "range": range,
        "interval": interval,
        "points": [round(float(v), 2) for v in closes.tolist()],
        "dates": [d.strftime("%Y-%m-%d") for d in closes.index],
    }


@app.get("/api/report/{ticker}")
def get_ai_report(ticker: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS generated_reports (
            ticker TEXT PRIMARY KEY,
            description TEXT,
            outlook TEXT,
            key_risks TEXT,
            generated_at DATETIME
        )
        """
    )
    cursor.execute(
        "SELECT description, outlook, key_risks FROM generated_reports WHERE ticker = ?", (ticker,)
    )
    report = cursor.fetchone()
    conn.close()
    if report:
        return {
            "ticker": ticker,
            "description": report["description"],
            "outlook": report["outlook"],
            "key_risks": json.loads(report["key_risks"]) if report["key_risks"] else [],
        }
    return {"error": "Report not found", "status": "pending"}
