# import pandas as pd
# import google.generativeai as genai
# import time
# import os
# from pathlib import Path
# from dotenv import load_dotenv

# # --- BULLETPROOF PATHS ---
# load_dotenv()
# API_KEY = os.getenv("GEMINI_API_KEY")

# SCRIPT_DIR = Path(__file__).resolve().parent
# ROOT_DIR = SCRIPT_DIR.parent.parent
# DATA_DIR = ROOT_DIR / "data"

# INPUT_CSV = DATA_DIR / "fully_cleaned_dataset.csv" 
# OUTPUT_CSV = DATA_DIR / "holdings_with_tickers.csv"
# # -------------------------

# def get_ticker_from_gemini(model, company, country):
#     prompt = f"""
#     Return ONLY the Yahoo Finance ticker for this company.
#     No extra words. No explanations. No markdown formatting.
#     Make sure the ticker is EXACTLY the one used on Yahoo Finance.
#     IF not 100% sure, return UNKNOWN.

#     Company: {company}
#     Country: {country}
    
#     CRITICAL RULES:
#     - If the stock has a specific share class, you MUST use a hyphen (-), never a dot (.).
#     - Example: Use TECK-B.TO instead of TECK.B.TO.

#     Examples:
#     ATZ.TO
#     RELIANCE.NS
#     AAPL
#     """

#     for attempt in range(3):
#         try:
#             response = model.generate_content(prompt, generation_config=genai.GenerationConfig(temperature=0.0))
#             return response.text.strip()
#         except Exception as e:
#             if "429" in str(e) or "Quota" in str(e):
#                 wait_time = 65 * (2 ** attempt)
#                 print(f"   [Rate limited! Waiting {wait_time}s... Retry {attempt + 1}/3]", flush=True)
#                 time.sleep(wait_time) 
#             else:
#                 return "ERROR"
#     return "ERROR_TIMEOUT"

# def run_gemini_comparison():
#     genai.configure(api_key=API_KEY)
#     model = genai.GenerativeModel('gemini-2.5-flash')
    
#     df = pd.read_csv(INPUT_CSV)
#     new_tickers = []
    
#     print(f"Starting Gemini processing for {len(df)} companies...\n", flush=True)

#     for counter, (index, row) in enumerate(df.iterrows(), 1):
#         company = str(row.get("name", "Unknown"))
#         country = str(row.get("country", "Unknown"))
#         gemini_ticker = get_ticker_from_gemini(model, company, country)
        
#         print(f"[{counter}/{len(df)}] {company} -> {gemini_ticker}", flush=True)
#         new_tickers.append(gemini_ticker)
#         time.sleep(2.1)

#     df["Yahoo_Ticker"] = new_tickers
#     df.to_csv(OUTPUT_CSV, index=False)
#     print(f"✅ SUCCESS! Saved to: {OUTPUT_CSV}")

# if __name__ == "__main__":
#     run_gemini_comparison()