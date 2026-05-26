# 1
import os
import tempfile
import pandas as pd
from io import StringIO
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent.parent
DATA_DIR = ROOT_DIR / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
OUTPUT_CSV = DATA_DIR / "fully_cleaned_dataset_with_reasons.csv"

def apply_custom_filters(df):
    print("STEP:Applying country/industry filters...", flush=True)
    print("PROGRESS:4/5", flush=True)

    df['Market Value(NOK)'] = pd.to_numeric(df['Market Value(NOK)'], errors='coerce')
    df['Ownership'] = df['Ownership'].astype(str).str.replace('%', '', regex=False)
    df['Ownership'] = pd.to_numeric(df['Ownership'], errors='coerce')

    rows_to_keep = []

    for (country, industry), group in df.groupby(['Country', 'Industry']):
        top_own = 0
        top_mv = 0

        if country == 'Canada':
            top_own, top_mv = 10, 10
        elif country == 'Germany':
            top_own, top_mv = 10, 10
        elif country == 'India':
            top_own, top_mv = 50, 50
        elif country == 'Singapore':
            top_own, top_mv = 5, 5
        elif country == 'United Kingdom':
            if industry in ['Consumer Discretionary', 'Financials', 'Industrials']:
                top_own, top_mv = 20, 20
            else:
                top_own, top_mv = 10, 5
        elif country == 'United States':
            if industry in ['Consumer Discretionary', 'Financials', 'Health Care', 'Technology', 'Industrials']:
                top_own, top_mv = 50, 50
            else:
                top_own, top_mv = 30, 30
        else:
            continue

        own_indices = group.nlargest(top_own, 'Ownership').index
        mv_indices = group.nlargest(top_mv, 'Market Value(NOK)').index
        keep_indices = own_indices.union(mv_indices)
        combined_top = group.loc[keep_indices].copy()

        is_own = combined_top.index.isin(own_indices)
        is_mv = combined_top.index.isin(mv_indices)

        combined_top.loc[is_own & ~is_mv, 'Selection Reason'] = 'Ownership'
        combined_top.loc[is_mv & ~is_own, 'Selection Reason'] = 'Market Value'
        combined_top.loc[is_own & is_mv, 'Selection Reason'] = 'Both'

        rows_to_keep.append(combined_top)

    if rows_to_keep:
        df_final = pd.concat(rows_to_keep, ignore_index=True)
        print(f"Filtered: {len(df)} rows → {len(df_final)} rows", flush=True)
        return df_final
    else:
        print("No data matched the filter rules!", flush=True)
        return pd.DataFrame()

def fetch_portfolio(year: int):
    url = (
        f"https://www.nbim.no/en/investments/all-investments/"
        f"?asset_class=equity&country=US&year={year}&format=csv"
    )
    print(f"STEP:Launching browser for year {year}...", flush=True)
    print("PROGRESS:1/5", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        )

        print(f"STEP:Navigating to NBIM website...", flush=True)
        print("PROGRESS:2/5", flush=True)
        page.goto(url)
        try:
            page.get_by_text("Accept all cookies", exact=False).click(timeout=3000)
        except Exception:
            pass

        print("STEP:Downloading CSV report...", flush=True)
        print("PROGRESS:3/5", flush=True)
        page.get_by_text("Download report", exact=False).first.click()

        with page.expect_download(timeout=30000) as download_info:
            page.get_by_text(".csv", exact=False).first.click()

        download = download_info.value
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "temp.csv"
            download.save_as(path)
            try:
                csv_text = path.read_text(encoding="utf-16")
            except UnicodeDecodeError:
                csv_text = path.read_text(encoding="utf-8-sig")

        browser.close()

    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    snapshot_path = SNAPSHOTS_DIR / f"nbim_global_raw_{year}_{today}.csv"
    with open(snapshot_path, "w", encoding="utf-8") as f:
        f.write(csv_text)
    print(f"Snapshot saved: {snapshot_path.name}", flush=True)

    raw_df = pd.read_csv(StringIO(csv_text), sep=";", decimal=",")
    clean_df = apply_custom_filters(raw_df)

    print("STEP:Saving cleaned data...", flush=True)
    print("PROGRESS:5/5", flush=True)
    clean_df.to_csv(OUTPUT_CSV, index=False)
    print(f"Saved {len(clean_df)} rows to {OUTPUT_CSV.name}", flush=True)

    return clean_df

if __name__ == "__main__":
    # Try previous year first (NBIM publishes annual data with a ~1 year lag)
    from datetime import datetime as _dt
    year = _dt.now().year - 1
    fetch_portfolio(year)
