import sqlite3
import pandas as pd
import requests
import time
import os
import re
from dotenv import load_dotenv

# --- CONFIGURATION ---
load_dotenv()
API_KEY = os.getenv("OPENFIGI_API_KEY")
RESET_DATABASE = False       # Set to True to update the table structure with the Country column
MAX_API_CALLS = 200          
# ---------------------

def clean_ticker(raw_ticker):
    if not raw_ticker:
        return None
    # Split by space and take the first part (e.g., "AGI1 EUR" -> "AGI1")
    base_ticker = str(raw_ticker).split(' ')[0]
    # Remove numbers (e.g., "AGI1" -> "AGI")
    clean = re.sub(r'[^a-zA-Z]', '', base_ticker)
    return clean

def resolve_names_to_tickers():
    if not API_KEY:
        print("Error: Could not find OPENFIGI_API_KEY in .env file.")
        return

    conn = sqlite3.connect("../nbim.db")
    
    if RESET_DATABASE:
        print("Resetting database to add Country column...")
        conn.execute("DROP TABLE IF EXISTS ticker_cache")
        conn.commit()

    # UPDATED: We now select BOTH name and country
    try:
        holdings_df = pd.read_sql("SELECT DISTINCT name, country FROM holdings", conn)
        # Create a list of dictionaries for easier looping
        all_companies = holdings_df.to_dict('records')
    except Exception as e:
        print(f"Error reading database: {e}")
        return

    try:
        cached_df = pd.read_sql("SELECT name FROM ticker_cache", conn)
        cached_names = set(cached_df['name'].tolist())
    except:
        cached_names = set()

    # Filter out companies we already have
    companies_to_fetch = [c for c in all_companies if c['name'] not in cached_names]
    
    url = 'https://api.openfigi.com/v3/search'
    headers = {'Content-Type': 'application/json', 'X-OPENFIGI-APIKEY': API_KEY}
    
    print(f"Starting... Will process {MAX_API_CALLS} companies.")

    calls_made = 0

    for i, company in enumerate(companies_to_fetch, 1):
        if calls_made >= MAX_API_CALLS:
            break

        comp_name = company['name']
        comp_country = company['country']
        
        # Clean the name for better searching
        search_query = comp_name.split(' (')[0].replace(" Corp", "").replace(" Inc", "").replace(" Ltd", "")
        
        payload = {"query": search_query, "securityType2": "Common Stock"}
        ticker = None
        
        try:
            response = requests.post(url, headers=headers, json=payload)
            calls_made += 1
            
            if response.status_code == 200:
                data = response.json()
                if 'data' in data and len(data['data']) > 0:
                    raw_symbol = data['data'][0].get('ticker')
                    ticker = clean_ticker(raw_symbol)
        except Exception as e:
            print(f"Error: {e}")
        
        print(f"[{calls_made}/{MAX_API_CALLS}] {comp_name} ({comp_country}) -> {ticker or '???'}")
        
        # UPDATED: Save name, country, and ticker
        result_data = {
            "name": comp_name,
            "country": comp_country,
            "ticker": ticker
        }
        pd.DataFrame([result_data]).to_sql("ticker_cache", conn, if_exists="append", index=False)
        
        time.sleep(2.5)

    # Save Backup
    print("\nSaving CSV Backup...")
    try:
        os.makedirs("../data", exist_ok=True)
        backup_df = pd.read_sql("SELECT * FROM ticker_cache", conn)
        backup_df.to_csv("../data/ticker_cache_backup.csv", index=False)
        print("Backup saved: data/ticker_cache_backup.csv")
    except Exception as e:
        print(f"Backup failed: {e}")
        
    conn.close()
    print("Done!")

if __name__ == "__main__":
    resolve_names_to_tickers()