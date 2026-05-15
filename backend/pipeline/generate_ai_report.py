#4
import sqlite3
import json
import time
from datetime import datetime
from pathlib import Path
import sys

# --- BULLETPROOF PATHS ---
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DB_PATH = BACKEND_DIR / "nbim.db"

# We need to tell Python where to find your llm_client.py!
sys.path.append(str(BACKEND_DIR / "app"))
from llm_client import FinancialLLM
# -------------------------

def batch_generate_reports():
    print("🔌 Connecting to database...")
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    # 1. Ensure the table exists
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS generated_reports (
        ticker TEXT PRIMARY KEY,
        description TEXT,
        outlook TEXT,
        key_risks TEXT,
        generated_at DATETIME
    )
    """)
    conn.commit()
    
    print("🔍 Figuring out which companies need AI reports...")
    
    # 2. Get ALL valid tickers using safe raw SQL (NO PANDAS!)
    # 2. Get ALL valid tickers using safe raw SQL (NO PANDAS!)
    cursor.execute("SELECT DISTINCT Yahoo_Ticker FROM enriched_holdings WHERE Yahoo_Ticker IS NOT NULL")
    all_tickers = [row[0] for row in cursor.fetchall()]
    
    # Get ALREADY FINISHED companies
    cursor.execute("SELECT ticker FROM generated_reports")
    finished_tickers = [row[0] for row in cursor.fetchall()]
    
    # Calculate the remaining ones
    tickers_to_process = [t for t in all_tickers if t not in finished_tickers and t not in ["UNKNOWN", "ERROR", "ERROR_TIMEOUT"]]
    
    total_remaining = len(tickers_to_process)
    if total_remaining == 0:
        print("🎉 All companies already have AI reports! Nothing to do.")
        conn.close()
        return

    print(f"🚀 Starting Batch AI Generation locally for {total_remaining} companies...")
    print("☕ You can leave this running in the background!")
    print("-" * 50)
    
    # 3. Fire up the LLM
    llm = FinancialLLM(model_name="mistral")
    
    # 4. Loop through the remaining companies
    for index, ticker in enumerate(tickers_to_process, 1):
        try:
            # THE FIX: Grab data safely (Bulletproof positional indices)
            cursor.execute("SELECT name, sector, country, pe_ratio, market_cap FROM enriched_holdings WHERE Yahoo_Ticker = ?", (ticker,))
            company_data = cursor.fetchone()
            
            if not company_data:
                continue
                
            company_dict = {
                "name": company_data[0],
                "sector": company_data[1],
                "country": company_data[2],
                "pe_ratio": company_data[3],
                "market_cap": company_data[4]
            }
            
            print(f"[{index}/{total_remaining}] 🤖 Mistral is analyzing {company_dict['name']} ({ticker})...")
            
            # Generate!
            start_time = time.time()
            report = llm.generate_report(company_dict)
            elapsed = time.time() - start_time
            
            # 5. Smart Saving Logic
            if report.get("description") != "Report generation failed. AI service unavailable.":
                
                # Armor: Flatten lists if Mistral formatted it weirdly
                raw_desc = report.get("description", "N/A")
                safe_desc = " ".join(raw_desc) if isinstance(raw_desc, list) else str(raw_desc)
                
                raw_outlook = report.get("outlook", "N/A")
                safe_outlook = " ".join(raw_outlook) if isinstance(raw_outlook, list) else str(raw_outlook)
                
                safe_risks = json.dumps(report.get("key_risks", []))
                
                # Save to Database using ISO format
                cursor.execute("""
                    INSERT OR REPLACE INTO generated_reports (ticker, description, outlook, key_risks, generated_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (ticker, safe_desc, safe_outlook, safe_risks, datetime.now().isoformat()))
                conn.commit()
                
                print(f"   ✅ Saved in {elapsed:.1f} seconds.")
            else:
                print(f"   ⚠️ Generation failed for {ticker}. Skipping for now.")
                
        except Exception as e:
            print(f"   ❌ Critical error on {ticker}: {e}")
            
    conn.close()
    print("\n🎉 Batch processing complete!")

if __name__ == "__main__":
    batch_generate_reports()