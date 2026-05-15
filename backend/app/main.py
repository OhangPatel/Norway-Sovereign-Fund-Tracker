from fastapi import FastAPI, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
from pathlib import Path
import json
import subprocess
from datetime import datetime

app = FastAPI(title="NBIM Tracker API")

# Step 1: Scaffold & CORS setup (Allows your Vite app to securely request data)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect to the DB we built
DB_PATH = Path(__file__).resolve().parent.parent / "nbim.db"

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    # This magic line tells SQLite to return data as Python dictionaries instead of raw tuples!
    conn.row_factory = sqlite3.Row 
    return conn

# ---------------------------------------------------------
# Step 2: Build GET /holdings endpoint (The Main Data Table)
# ---------------------------------------------------------
@app.get("/api/holdings")
def get_holdings(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=500, description="Items per page")
):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    offset = (page - 1) * limit
    
    # Get the total count of unique companies for the frontend pagination math
    cursor.execute("SELECT COUNT(DISTINCT Yahoo_Ticker) FROM enriched_holdings WHERE Yahoo_Ticker IS NOT NULL")
    total_count = cursor.fetchone()[0]
    
    # Fetch the actual data. 
    # GROUP BY Yahoo_Ticker cleanly ignores the duplicates from your double-run!
    # Fetch the actual data. 
    query = """
        SELECT 
            Name, 
            Yahoo_Ticker, 
            sector, 
            Country AS country, 
            pe_ratio, 
            market_cap,
            high_52w,
            low_52w,
            fetched_at
        FROM enriched_holdings
        WHERE Yahoo_Ticker IS NOT NULL
        GROUP BY Yahoo_Ticker
        ORDER BY market_cap DESC
        LIMIT ? OFFSET ?
    """
    cursor.execute(query, (limit, offset))
    rows = cursor.fetchall()
    conn.close()
    
    return {
        "data": [dict(row) for row in rows],
        "pagination": {
            "total_count": total_count,
            "current_page": page,
            "limit": limit,
            "total_pages": (total_count + limit - 1) // limit
        }
    }

# ---------------------------------------------------------
# Step 3: Build GET /report/{ticker} endpoint (Existing AI Report)
# ---------------------------------------------------------
@app.get("/api/report/{ticker}")
def get_ai_report(ticker: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT description, outlook, key_risks FROM generated_reports WHERE ticker = ?", (ticker,))
    report = cursor.fetchone()
    conn.close()
    
    if report:
        return {
            "ticker": ticker,
            "description": report["description"],
            "outlook": report["outlook"],
            "key_risks": json.loads(report["key_risks"]) if report["key_risks"] else []
        }
    
    return {"error": "Report not found or not generated yet.", "status": "pending"}

# This is the worker function that runs silently in the background
def run_pipeline_worker():
    print(f"[{datetime.now()}] 🚀 Starting background pipeline update...")
    try:
        # 1. Run the Yahoo Finance scraper (Make sure this matches your script's actual name!)
        print("Fetching live market data from Yahoo Finance...")
        subprocess.run(["python", "../pipeline/your_yahoo_scraper_script.py"], check=True)
        
        # 2. SKIP AI GENERATION FOR NOW
        print("Skipping AI Report generation...")
        # subprocess.run(["python", "../pipeline/5_generate_ai_reports.py"], check=True)
        
        # 3. Export the Mega CSV with the fresh Yahoo data
        print("Exporting Mega CSV...")
        subprocess.run(["python", "../pipeline/export_report.py"], check=True)
        
        print(f"[{datetime.now()}] ✅ Background pipeline completed successfully!")
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Pipeline crashed during execution: {e}")
    except Exception as e:
        print(f"❌ Unexpected error in background task: {e}")