from fastapi import FastAPI
import sqlite3
import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR.parent / "nbim.db"

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Welcome to the NBIM Tracker API! Phase 3 Backend is complete."}

@app.get("/api/holdings")
def get_holdings():
    if not DB_PATH.exists():
        return {"status": "error", "message": "Database not found. Run the data pipeline first!"}
        
    try:
        conn = sqlite3.connect(str(DB_PATH))
        
        df = pd.read_sql("SELECT * FROM enriched_holdings", conn)
        conn.close()
        
        df = df.where(pd.notnull(df), None)
        
        return df.to_dict(orient="records")
    except Exception as e:
        return {"status": "error", "message": f"Could not read data: {e}"}