# 1  —  Download one NBIM holdings period and apply the selection filters
"""Scrapes nbim.no for a single reporting period and writes the filtered holdings.

PERIODS
NBIM publishes holdings twice a year, and every period back to 1998 stays available:
    annual   as of 31 December   ->  period "YYYY-12-31"
    half-year as of 30 June      ->  period "YYYY-06-30"  (2024 onward only)

HOW THE PERIOD IS SELECTED  (this is the part that used to be broken)
The old URL was ".../all-investments/?asset_class=equity&country=US&year=2023".
None of those query parameters reach the page — it is a single-page app that keeps
the period in the URL HASH instead. So every download returned whatever NBIM showed
by default, no matter which year was asked for. Three snapshots in data/snapshots/
prove it: two named 2025 and one named 2023, all byte-identical, all actually 2025.
The CSV carries no date column, so nothing inside the file could reveal the mismatch
— only the filename, and the filename was wrong.

The fix is two-part and both halves matter:
  1. Navigate to the hash the site actually uses, e.g. ".../all-investments/#/2023-12-31".
  2. Read the period back off the loaded page and REFUSE to continue if it is not the
     one that was asked for. A silent fallback to the default is what caused the bug,
     so it now fails loudly instead.

The period travels with the data from here on, as the As_Of column, so downstream
steps never have to infer it from a filename or a file's mtime.
"""
import argparse
import re
import sys
import tempfile
import pandas as pd
from io import StringIO
from datetime import date, datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent.parent
DATA_DIR = ROOT_DIR / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
OUTPUT_CSV = DATA_DIR / "fully_cleaned_dataset_with_reasons.csv"

BASE_URL = "https://www.nbim.no/en/investments/all-investments/"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# A period is always one of the two publication dates — nothing else exists.
PERIOD_RE = re.compile(r"^(\d{4})-(12-31|06-30)$")
# The Year button reads e.g. "Year  (30.12.2025)". NBIM renders it one day behind the
# period it loaded (30.12 for 31-12, 29.06 for 30-06), consistently across every period
# tested, so only the year and month are trustworthy enough to verify against.
DISPLAYED_DATE_RE = re.compile(r"(\d{2})\.(\d{2})\.(\d{4})")


def parse_period(value):
    """'2025-12-31' -> date. Rejects anything NBIM does not actually publish."""
    if not PERIOD_RE.match(value or ""):
        raise argparse.ArgumentTypeError(
            f"'{value}' is not an NBIM period — expected YYYY-12-31 (annual) "
            f"or YYYY-06-30 (half-year, 2024 onward)"
        )
    return date.fromisoformat(value)


def _read_displayed_period(page):
    """The period the loaded page is actually showing, read off the Year button.

    Returns a date, or None if the button could not be read. December means the
    annual period, June means the half-year one; any other month means the page is
    not what we think it is and the caller should stop.
    """
    try:
        text = page.locator("button:has-text('Year')").first.text_content(timeout=15000) or ""
    except Exception:
        return None
    m = DISPLAYED_DATE_RE.search(text)
    if not m:
        return None
    _, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if month == 12:
        return date(year, 12, 31)
    if month == 6:
        return date(year, 6, 30)
    return None


def _dismiss_cookie_banner(page):
    for label in ("Accept all cookies", "Accept all", "Godta alle"):
        try:
            page.get_by_text(label, exact=False).first.click(timeout=3000)
            return
        except Exception:
            continue


def fetch_portfolio(period=None):
    """Download one period. period=None takes whatever NBIM currently shows as latest.

    Returns (DataFrame, period_actually_fetched).
    """
    url = f"{BASE_URL}#/{period.isoformat()}" if period else BASE_URL
    wanted = f"period {period.isoformat()}" if period else "the latest period"
    print(f"STEP:Launching browser for {wanted}...", flush=True)
    print("PROGRESS:1/5", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)

        try:
            print("STEP:Navigating to NBIM website...", flush=True)
            print("PROGRESS:2/5", flush=True)
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            _dismiss_cookie_banner(page)
            page.wait_for_timeout(4000)

            # The whole point of this function: confirm the page is showing the period
            # we asked for before trusting a single row of what it hands us.
            shown = _read_displayed_period(page)
            if shown is None:
                raise RuntimeError(
                    "Could not read the period from the page — NBIM's markup has "
                    "probably changed. Refusing to download data of unknown vintage."
                )
            if period and shown != period:
                raise RuntimeError(
                    f"Asked for {period.isoformat()} but the page loaded "
                    f"{shown.isoformat()}. This is the silent-fallback bug that made "
                    f"every historical download return the latest data; not continuing."
                )
            period = shown
            print(f"Period confirmed: {period.isoformat()}", flush=True)

            print("STEP:Downloading CSV report...", flush=True)
            print("PROGRESS:3/5", flush=True)
            page.get_by_text("Download report", exact=False).first.click(timeout=30000)
            page.wait_for_timeout(1000)
            with page.expect_download(timeout=60000) as download_info:
                page.get_by_text(".csv", exact=False).first.click()

            download = download_info.value
            with tempfile.TemporaryDirectory() as tmpdir:
                path = Path(tmpdir) / "temp.csv"
                download.save_as(path)
                try:
                    csv_text = path.read_text(encoding="utf-16")
                except UnicodeDecodeError:
                    csv_text = path.read_text(encoding="utf-8-sig")
        finally:
            browser.close()

    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    # Named for the PERIOD it contains, which is now verified, plus the day it was
    # downloaded. The old name used the requested year, which is how a 2025 file came
    # to be called 2023.
    snapshot_path = SNAPSHOTS_DIR / f"nbim_holdings_{period.isoformat()}_dl{today}.csv"
    snapshot_path.write_text(csv_text, encoding="utf-8")
    print(f"Snapshot saved: {snapshot_path.name}", flush=True)

    raw_df = pd.read_csv(StringIO(csv_text), sep=";", decimal=",")
    print(f"Raw rows for {period.isoformat()}: {len(raw_df)}", flush=True)
    return raw_df, period


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


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--period", type=parse_period, default=None,
        help="YYYY-12-31 (annual) or YYYY-06-30 (half-year). "
             "Omit to take whatever NBIM currently publishes as the latest.",
    )
    ap.add_argument(
        "--out", type=Path, default=OUTPUT_CSV,
        help=f"where to write the filtered result (default: {OUTPUT_CSV.name})",
    )
    args = ap.parse_args()

    raw_df, period = fetch_portfolio(args.period)
    clean_df = apply_custom_filters(raw_df)
    if clean_df.empty:
        print("Nothing to save — the filters matched no rows.", flush=True)
        return 1

    print("STEP:Saving cleaned data...", flush=True)
    print("PROGRESS:5/5", flush=True)
    # The period rides with the rows so no later step has to guess it from a filename.
    clean_df.insert(0, "As_Of", period.isoformat())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    clean_df.to_csv(args.out, index=False)
    print(f"Saved {len(clean_df)} rows for {period.isoformat()} to {args.out.name}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
