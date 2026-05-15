#5
import sqlite3
import pandas as pd
from pathlib import Path

# --- SET UP PATHS ---
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DB_PATH = BACKEND_DIR / "nbim.db"
OUTPUT_PATH = BACKEND_DIR / "nbim_mega_report.csv"

def export_mega_csv():
    print("🔌 Connecting to database...")
    conn = sqlite3.connect(str(DB_PATH))
    
    # 1. Read both tables into Pandas
    print("📊 Loading financial data and AI reports...")
    df_holdings = pd.read_sql("SELECT * FROM enriched_holdings", conn)
    df_reports = pd.read_sql("SELECT * FROM generated_reports", conn)
    
    conn.close()
    
    # --- THE DATA CLEANING FIXES ---
    print("🧹 Cleaning up duplicates and text spacing...")
    
    # Fix 1: Drop the duplicate Yahoo Finance runs, keeping only the most recent one
    df_holdings = df_holdings.sort_values("fetched_at").drop_duplicates(subset=["Yahoo_Ticker"], keep="last")
    
    # Fix 2: Strip any invisible spaces from the tickers so the merge matches perfectly
    df_holdings["Yahoo_Ticker"] = df_holdings["Yahoo_Ticker"].astype(str).str.strip()
    df_reports["ticker"] = df_reports["ticker"].astype(str).str.strip()
    # --------------------------------
    
    # 2. Perform the "Mega Merge"
    print(f"🧬 Merging {len(df_holdings)} unique companies together...")
    df_mega = pd.merge(
        df_holdings, 
        df_reports, 
        left_on="Yahoo_Ticker", 
        right_on="ticker", 
        how="left"
    )
    
    # 3. Clean up the merged data (remove the duplicate ticker column)
    if "ticker" in df_mega.columns:
        df_mega = df_mega.drop(columns=["ticker"])
        
    # 4. Save to CSV
    print(f"💾 Saving clean Mega File to: {OUTPUT_PATH}")
    df_mega.to_csv(OUTPUT_PATH, index=False, encoding='utf-8')
    
    print("🎉 Success! Your pristine Mega CSV is ready.")

if __name__ == "__main__":
    export_mega_csv()