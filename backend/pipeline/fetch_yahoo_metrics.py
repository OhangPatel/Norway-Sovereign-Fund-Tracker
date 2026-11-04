#2
import pandas as pd
import yfinance as yf
from yfinance.exceptions import YFRateLimitError
import sqlite3
import time
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATA_DIR = BACKEND_DIR.parent / "data"

INPUT_CSV = DATA_DIR / "holdings_with_tickers.csv"
PERIODS_DIR = DATA_DIR / "periods"
DB_PATH = BACKEND_DIR / "nbim.db"
BATCH_SIZE = 20
# A floor on how long a batch takes. Each .info is three requests, so this is what sets
# the request rate: the two published runs that averaged 5s a batch lost the end of the
# alphabet, and the four at 7-8s lost nothing.
MIN_BATCH_SECONDS = 8
# Waited in turn before asking again for a ticker Yahoo rate limited.
RATE_LIMIT_WAITS = (30, 60, 120, 240, 480)
# Before the second pass. Yahoo's throttling does not always arrive as a rate-limit error
# (a 401 surfaces as a TypeError from inside yfinance), and those failures have not waited.
RETRY_PASS_WAIT = 300
NOT_A_TICKER = {"", "nan", "UNKNOWN", "ERROR", "ERROR_TIMEOUT", "N/A", "NA", "NONE", "NULL",
                "N/A-PRIVATE"}


def collect_tickers():
    """Every ticker across every period, deduplicated.

    Historical periods show CURRENT market data — that is the agreed design — so a
    company held in 2022 and sold since still needs a live price today. Fetching only
    the newest period's holdings would leave every older period without metrics.

    Falls back to the single top-level file when no per-period directories exist, so
    the script still works on its own.
    """
    files = sorted(PERIODS_DIR.glob("*/holdings_with_tickers.csv"))
    if not files:
        files = [INPUT_CSV]
    tickers = set()
    for f in files:
        df = pd.read_csv(f)
        if "Yahoo_Ticker" in df.columns:
            tickers |= {str(t).strip() for t in df["Yahoo_Ticker"].dropna()}
    valid = sorted(t for t in tickers if t.upper() not in NOT_A_TICKER)
    print(f"{len(valid)} distinct ticker(s) across {len(files)} period file(s).", flush=True)
    return valid


def read_info(ticker_symbol):
    """A ticker's .info, waiting out rate limits. Raises YFRateLimitError if they outlast
    every wait.

    A new Ticker for each attempt: yfinance marks one as fetched before its request goes
    out, so asking a failed one again returns None without trying.
    """
    for wait in RATE_LIMIT_WAITS:
        try:
            return yf.Ticker(ticker_symbol).info
        except YFRateLimitError:
            print(f"Rate limited by Yahoo Finance on {ticker_symbol} — waiting {wait}s...", flush=True)
            time.sleep(wait)
    return yf.Ticker(ticker_symbol).info


def fetch_tickers(conn, tickers):
    """Fetch and save tickers in paced batches. Returns {ticker: error} for the ones that
    could not be read. A ticker Yahoo has no data for is not one of them."""
    cursor = conn.cursor()
    failed = {}
    total_batches = (len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(tickers), BATCH_SIZE):
        started = time.monotonic()
        batch_num = i // BATCH_SIZE + 1
        batch = tickers[i : i + BATCH_SIZE]

        print(f"PROGRESS:{batch_num}/{total_batches}", flush=True)
        print(f"STEP:Fetching batch {batch_num}/{total_batches} ({len(batch)} tickers)...", flush=True)

        fetched_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        for ticker_symbol in batch:
            try:
                info = read_info(ticker_symbol)
                if not info or 'symbol' not in info:
                    continue

                metrics = {
                    "ticker": ticker_symbol, "fetched_at": fetched_at,
                    "pe_ratio": info.get("trailingPE"), "forward_pe": info.get("forwardPE"),
                    "price_to_book": info.get("priceToBook"), "dividend_yield": info.get("dividendYield"),
                    "market_cap": info.get("marketCap"), "analyst_recommendation": info.get("recommendationKey"),
                    "target_mean_price": info.get("targetMeanPrice"), "high_52w": info.get("fiftyTwoWeekHigh"),
                    "low_52w": info.get("fiftyTwoWeekLow"), "beta": info.get("beta"),
                    "sector": info.get("sector"), "industry": info.get("industry"),
                    "price": info.get("regularMarketPrice") or info.get("currentPrice"),
                    "change": info.get("regularMarketChangePercent"),
                }

                cursor.execute("""
                    INSERT OR REPLACE INTO financial_metrics
                    (ticker, fetched_at, pe_ratio, forward_pe, price_to_book, dividend_yield,
                    market_cap, analyst_recommendation, target_mean_price, high_52w, low_52w, beta, sector, industry,
                    price, change)
                    VALUES (:ticker, :fetched_at, :pe_ratio, :forward_pe, :price_to_book, :dividend_yield,
                    :market_cap, :analyst_recommendation, :target_mean_price, :high_52w, :low_52w, :beta, :sector, :industry,
                    :price, :change)
                """, metrics)
                print(f"Saved: {ticker_symbol}", flush=True)
            except YFRateLimitError:
                raise
            except Exception as e:
                print(f"Error reading {ticker_symbol}: {e}", flush=True)
                failed[ticker_symbol] = str(e)

        conn.commit()
        time.sleep(max(0, MIN_BATCH_SECONDS - (time.monotonic() - started)))

    return failed


def fetch_financial_metrics():
    valid_tickers = collect_tickers()

    print(f"Starting yfinance batch fetcher for {len(valid_tickers)} companies...", flush=True)

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Add price/change columns if this is an existing DB from before they were added
    for col in ("price", "change"):
        try:
            cursor.execute(f"ALTER TABLE financial_metrics ADD COLUMN {col} REAL")
            conn.commit()
        except Exception:
            pass

    try:
        failed = fetch_tickers(conn, valid_tickers)
        if failed:
            print(f"{len(failed)} ticker(s) could not be read — waiting {RETRY_PASS_WAIT}s, then trying them again...", flush=True)
            time.sleep(RETRY_PASS_WAIT)
            failed = fetch_tickers(conn, list(failed))
    except YFRateLimitError:
        # A block rather than a blip, and every ticker left would wait just as long. Keep
        # what was saved: the check in weekly-prices.yml decides whether it is good enough.
        conn.commit()
        conn.close()
        print(f"Stopped: Yahoo Finance was still rate limiting after {sum(RATE_LIMIT_WAITS)}s of waiting. The tickers not yet reached have no metrics.", flush=True)
        return

    conn.close()

    if failed:
        print(f"Finished with {len(failed)} ticker(s) missing metrics:", flush=True)
        for ticker_symbol, reason in failed.items():
            print(f"  - {ticker_symbol}: {reason}", flush=True)
    else:
        print("Done! Financial metrics saved to SQLite.", flush=True)

if __name__ == "__main__":
    fetch_financial_metrics()
