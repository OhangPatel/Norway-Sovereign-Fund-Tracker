#3
import pandas as pd
import sqlite3
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATA_DIR = BACKEND_DIR.parent / "data"

INPUT_CSV = DATA_DIR / "holdings_with_tickers.csv"
OUTPUT_CSV = DATA_DIR / "mega_portfolio_dataset.csv"
DB_PATH = BACKEND_DIR / "nbim.db"

def merge_and_save():
    print("Loading data...")
    
    df_original = pd.read_csv(INPUT_CSV)
    
    conn = sqlite3.connect(str(DB_PATH))
    df_metrics = pd.read_sql("SELECT * FROM financial_metrics", conn)
    
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

    df_merged.to_csv(OUTPUT_CSV, index=False)
    df_merged.to_sql("enriched_holdings", conn, if_exists="replace", index=False)
    conn.close()
    
    print(f"Success! Your data is merged.")
    print(f"Saved a CSV to: {OUTPUT_CSV}")
    print(f"Saved a new table named 'enriched_holdings' inside nbim.db")

if __name__ == "__main__":
    merge_and_save()