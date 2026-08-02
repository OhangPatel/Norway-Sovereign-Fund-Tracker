import pandas as pd
import google.generativeai as genai
import time
import os
from dotenv import load_dotenv

# --- CONFIGURATION ---
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

INPUT_CSV = "../data/final_portfolio_with_tickers.csv"  
OUTPUT_CSV = "../data/test_10_gemini_tickers.csv" 
MAX_TEST_ROWS = 10                            
# ---------------------

def get_ticker_from_gemini(model, company, country):
    prompt = f"""
    Return ONLY the Yahoo Finance ticker for this company.
    No extra words. No explanations. No markdown formatting.
    Make sure the ticker is EXACTLY the one used on Yahoo Finance.
    IF not 100% sure, return UNKNOWN.

    Company: {company}
    Country: {country}
    
    CRITICAL RULES:
    - If the stock has a specific share class (like Class A or Class B), you MUST use a hyphen (-), never a dot (.).
    - Example: Use TECK-B.TO (Correct) instead of TECK.B.TO (Incorrect).

    Examples of acceptable output:
    ATZ.TO
    RELIANCE.NS
    AAPL
    TECK-B.TO

    If you are not 100% sure, output:
    UNKNOWN
    """

    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(temperature=0.0)
            )
            return response.text.strip()
            
        except Exception as e:
            error_message = str(e)
            if "429" in error_message or "Quota" in error_message:
                # TRUE EXPONENTIAL BACKOFF MATH: 65s, 130s, 260s
                wait_time = 65 * (2 ** attempt)
                print(f"   [Rate limited! Waiting {wait_time} seconds to clear quota... Retry {attempt + 1}/{max_retries}]", flush=True)
                time.sleep(wait_time) 
            else:
                print(f"API Error: {e}", flush=True)
                return "ERROR"
                
    return "ERROR_TIMEOUT"

def run_gemini_comparison():
    if not API_KEY:
        print("❌ Error: Could not find GEMINI_API_KEY in .env file.", flush=True)
        return

    # Initialize the Gemini client
    genai.configure(api_key=API_KEY)
    
    # We use 2.0 Flash because it is incredibly fast and has the best free tier
    model = genai.GenerativeModel('gemini-2.5-flash')
    try:
        df = pd.read_csv(INPUT_CSV)
        df = df.head(MAX_TEST_ROWS)
        print(f"✅ Loaded and sliced down to the first {len(df)} companies for testing.\n", flush=True)
    except FileNotFoundError:
        print(f"❌ Error: Could not find {INPUT_CSV}.", flush=True)
        return

    new_tickers = []
    print("Starting Gemini 2.0 Flash processing...\n", flush=True)

    for counter, (index, row) in enumerate(df.iterrows(), 1):
        company = str(row.get("name", "Unknown"))
        country = str(row.get("country", "Unknown"))

        gemini_ticker = get_ticker_from_gemini(model, company, country)

        print(f"[{counter}/{len(df)}] {company} ({country}) -> {gemini_ticker}", flush=True)
        new_tickers.append(gemini_ticker)

        # Gemini's free tier is exactly 15 requests per minute.
        # Sleeping for 4.1 seconds guarantees we never go over that speed limit!
        time.sleep(2.1)

    df["gemini_ticker"] = new_tickers

    print("\nSaving test CSV...", flush=True)
    os.makedirs("../data", exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"✅ SUCCESS! File saved to: {OUTPUT_CSV}", flush=True)

if __name__ == "__main__":
    run_gemini_comparison()