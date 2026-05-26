#2
import pandas as pd
import yfinance as yf
import sqlite3
import time
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATA_DIR = BACKEND_DIR.parent / "data"

INPUT_CSV = DATA_DIR / "holdings_with_tickers.csv"
DB_PATH = BACKEND_DIR / "nbim.db"
BATCH_SIZE = 20

def fetch_financial_metrics():
    df = pd.read_csv(INPUT_CSV)
    valid_tickers = [t for t in df['Yahoo_Ticker'].dropna().unique() if t not in ["UNKNOWN", "ERROR", "ERROR_TIMEOUT"]]

    total_batches = (len(valid_tickers) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"Starting yfinance batch fetcher for {len(valid_tickers)} companies ({total_batches} batches)...", flush=True)

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Add price/change columns if this is an existing DB from before they were added
    for col in ("price", "change"):
        try:
            cursor.execute(f"ALTER TABLE financial_metrics ADD COLUMN {col} REAL")
            conn.commit()
        except Exception:
            pass

    for i in range(0, len(valid_tickers), BATCH_SIZE):
        batch_num = i // BATCH_SIZE + 1
        batch = valid_tickers[i : i + BATCH_SIZE]
        ticker_string = " ".join(batch)

        print(f"PROGRESS:{batch_num}/{total_batches}", flush=True)
        print(f"STEP:Fetching batch {batch_num}/{total_batches} ({len(batch)} tickers)...", flush=True)

        fetched_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            yf_batch = yf.Tickers(ticker_string)
            for ticker_symbol in batch:
                try:
                    info = yf_batch.tickers[ticker_symbol].info
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
                except Exception as e:
                    print(f"Error reading {ticker_symbol}: {e}", flush=True)

            conn.commit()
            time.sleep(2)
        except Exception as e:
            if "429" in str(e):
                print("Rate limited by Yahoo Finance — waiting 30s...", flush=True)
                time.sleep(30)

    conn.close()
    print("Done! Financial metrics saved to SQLite.", flush=True)

if __name__ == "__main__":
    fetch_financial_metrics()
