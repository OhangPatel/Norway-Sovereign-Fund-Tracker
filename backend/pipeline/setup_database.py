# 0

import sqlite3
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR.parent / "nbim.db"

def setup_metrics_schema():
    print(f"Connecting to database at: {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    create_table_query = """
    CREATE TABLE IF NOT EXISTS financial_metrics (
        ticker TEXT PRIMARY KEY,
        fetched_at DATETIME,
        pe_ratio REAL,
        forward_pe REAL,
        price_to_book REAL,
        dividend_yield REAL,
        market_cap REAL,
        analyst_recommendation TEXT,
        target_mean_price REAL,
        high_52w REAL,
        low_52w REAL,
        beta REAL,
        sector TEXT,
        industry TEXT,
        price REAL,
        change REAL
    );
    """

    try:
        cursor.execute(create_table_query)
        conn.commit()
        print("Success! The 'financial_metrics' table is ready.")
        
        cursor.execute("PRAGMA table_info(financial_metrics);")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"Columns: {', '.join(columns)}")
        
    except Exception as e:
        print(f"Database error: {e}")
        
    finally:
        conn.close()

if __name__ == "__main__":
    setup_metrics_schema()