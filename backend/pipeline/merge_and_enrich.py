#3
import pandas as pd
import sqlite3
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATA_DIR = BACKEND_DIR.parent / "data"
FRONTEND_DATA = BACKEND_DIR.parent / "frontend" / "public" / "data.json"

INPUT_CSV = DATA_DIR / "holdings_with_tickers.csv"
OUTPUT_CSV = DATA_DIR / "mega_portfolio_dataset.csv"
DB_PATH = BACKEND_DIR / "nbim.db"

def merge_and_save():
    print("STEP:Loading holdings data...", flush=True)
    print("PROGRESS:1/4", flush=True)

    df_original = pd.read_csv(INPUT_CSV)

    conn = sqlite3.connect(str(DB_PATH))
    df_metrics = pd.read_sql("SELECT * FROM financial_metrics", conn)

    # Guard: deduplicate metrics so a corrupted DB never produces Cartesian-product duplicates.
    # Keep the most recently fetched row per ticker.
    if not df_metrics.empty and 'fetched_at' in df_metrics.columns:
        df_metrics = (
            df_metrics
            .sort_values('fetched_at', ascending=False, na_position='last')
            .drop_duplicates(subset=['ticker'], keep='first')
            .reset_index(drop=True)
        )

    print("STEP:Merging holdings with metrics...", flush=True)
    print("PROGRESS:2/4", flush=True)

    df_merged = pd.merge(
        df_original,
        df_metrics,
        left_on="Yahoo_Ticker",
        right_on="ticker",
        how="left"
    )

    columns_to_drop = []

    if 'ticker' in df_merged.columns:
        columns_to_drop.append('ticker')

    if 'Industry' in df_merged.columns and 'industry' in df_merged.columns:
        columns_to_drop.append('industry')

    if 'industry_y' in df_merged.columns:
        columns_to_drop.append('industry_y')
        df_merged.rename(columns={'industry_x': 'industry'}, inplace=True)

    if columns_to_drop:
        df_merged = df_merged.drop(columns=columns_to_drop)

    # Final guard: if the merge still produced duplicate rows (e.g. same Yahoo_Ticker in
    # holdings CSV), keep only the first occurrence so the output is 1 row per holding.
    rows_before = len(df_merged)
    df_merged = df_merged.drop_duplicates(keep='first').reset_index(drop=True)
    if len(df_merged) < rows_before:
        print(f"Deduplication removed {rows_before - len(df_merged)} duplicate rows.", flush=True)

    print("STEP:Saving to CSV and database...", flush=True)
    print("PROGRESS:3/4", flush=True)

    df_merged.to_csv(OUTPUT_CSV, index=False)
    df_merged.to_sql("enriched_holdings", conn, if_exists="replace", index=False)
    conn.close()

    print("STEP:Exporting data.json for frontend...", flush=True)
    print("PROGRESS:4/4", flush=True)

    col = df_merged.columns.tolist()

    def get(row, *names):
        for n in names:
            if n in col:
                v = row[n]
                if pd.notna(v):
                    return v
        return None

    records = []
    for _, row in df_merged.iterrows():
        records.append({
            "country":     get(row, "Country", "country"),
            "name":        get(row, "Name", "name"),
            "ticker":      get(row, "Yahoo_Ticker"),
            "industry":    get(row, "Industry", "industry"),
            "sector":      get(row, "sector"),
            "mvNok":       get(row, "Market Value(NOK)"),
            "mvUsd":       get(row, "Market Value(USD)"),
            "voting":      get(row, "Voting"),
            "ownership":   get(row, "Ownership"),
            "reason":      get(row, "Selection Reason"),
            "pe":          get(row, "pe_ratio"),
            "fwdPe":       get(row, "forward_pe"),
            "pb":          get(row, "price_to_book"),
            "divYield":    get(row, "dividend_yield"),
            "marketCap":   get(row, "market_cap"),
            "rec":         get(row, "analyst_recommendation"),
            "targetPrice": get(row, "target_mean_price"),
            "high52":      get(row, "high_52w"),
            "low52":       get(row, "low_52w"),
            "beta":        get(row, "beta"),
            "price":       get(row, "price"),
            "change":      get(row, "change"),
            "fetchedAt":   get(row, "fetched_at"),
        })

    FRONTEND_DATA.write_text(json.dumps(records, allow_nan=False, default=lambda _: None))

    print(f"Success! Merged {len(df_merged)} rows.", flush=True)
    print(f"Saved CSV → {OUTPUT_CSV}", flush=True)
    print(f"Saved JSON → {FRONTEND_DATA}", flush=True)

if __name__ == "__main__":
    merge_and_save()
