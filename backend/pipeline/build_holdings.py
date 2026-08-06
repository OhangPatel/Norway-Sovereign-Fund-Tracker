# 1b  —  Attach tickers to a freshly fetched period
"""Turns fully_cleaned_dataset_with_reasons.csv into holdings_with_tickers.csv.

WHY THIS EXISTS
This step was missing. Step #1 wrote fully_cleaned_dataset_with_reasons.csv and
nothing read it; steps #3 and #4 read holdings_with_tickers.csv, which nothing wrote.
The only script that ever bridged them, legacy/resolve_ticker.py, is commented out in
full. So "Refresh Holdings" would download new data, report success, and change
nothing on the site — the holdings file it fed had last been updated by hand.

THE TICKER MAP
NBIM publishes no ISIN or ticker, only a company name, and resolving a name against
Yahoo is slow and — as resolve_tickers.py documents at length — the step most likely
to attach the wrong company. So resolutions are remembered in data/ticker_map.csv and
reused. The map only ever grows: a company that leaves the portfolio keeps its entry,
so re-processing an older period costs no lookups at all.

This script never guesses. It matches names EXACTLY and leaves everything else blank
for resolve_tickers.py, which searches Yahoo and verifies each hit against the
exchange and the listed name before accepting it. A blank ticker is handled fine
downstream; a wrong one silently corrupts a row and collides with another holding.

TYPICAL USE
    python backend/pipeline/fetch_and_clean_holding.py --period 2024-12-31
    python backend/pipeline/build_holdings.py          # reports any unresolved names
    python backend/pipeline/resolve_tickers.py         # only if it reported some
    python backend/pipeline/build_holdings.py          # re-run to bank the new tickers
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent.parent / "data"
CLEANED_CSV = DATA_DIR / "fully_cleaned_dataset_with_reasons.csv"
HOLDINGS_CSV = DATA_DIR / "holdings_with_tickers.csv"
OVERRIDES_CSV = DATA_DIR / "ticker_overrides.csv"
TICKER_MAP_CSV = DATA_DIR / "ticker_map.csv"

# Same list resolve_tickers.py uses: strings that were written where a ticker belongs
# but name no company. They must never enter the map.
SENTINELS = {"", "N/A-PRIVATE", "N/A", "NA", "UNKNOWN", "ERROR", "ERROR_TIMEOUT", "NONE", "NULL"}

# holdings_with_tickers.csv column order, unchanged apart from As_Of at the front.
# Region is dropped: Country is finer-grained and nothing downstream reads Region.
OUTPUT_COLUMNS = [
    "As_Of", "Country", "Name", "Industry", "Market Value(NOK)", "Market Value(USD)",
    "Voting", "Ownership", "Incorporation Country", "Selection Reason", "Yahoo_Ticker",
]


def _is_ticker(v):
    return str(v).strip().upper() not in SENTINELS and str(v).strip().lower() != "nan"


def load_map():
    """name -> ticker, from the map plus any resolutions sitting in the holdings file.

    The absorb step matters: resolve_tickers.py writes only to holdings_with_tickers.csv
    and knows nothing about the map, so without this every repair it makes would be
    lost the next time a period was built.
    """
    mapping = {}
    if TICKER_MAP_CSV.exists():
        df = pd.read_csv(TICKER_MAP_CSV, dtype=str).fillna("")
        mapping = {r["Name"].strip(): r["Yahoo_Ticker"].strip()
                   for _, r in df.iterrows()
                   if r["Name"].strip() and _is_ticker(r["Yahoo_Ticker"])}
        print(f"Ticker map: {len(mapping)} known name(s).", flush=True)
    else:
        print("No ticker map yet — seeding it from holdings_with_tickers.csv.", flush=True)

    absorbed = 0
    if HOLDINGS_CSV.exists():
        df = pd.read_csv(HOLDINGS_CSV, dtype=str).fillna("")
        if "Yahoo_Ticker" in df.columns:
            for _, r in df.iterrows():
                name, tic = r["Name"].strip(), r["Yahoo_Ticker"].strip()
                if name and _is_ticker(tic) and mapping.get(name) != tic:
                    mapping[name] = tic
                    absorbed += 1
    if absorbed:
        print(f"Absorbed {absorbed} ticker(s) from holdings_with_tickers.csv.", flush=True)
    return mapping


def load_overrides():
    """Manual corrections. These always win — they exist because a lookup got it wrong."""
    if not OVERRIDES_CSV.exists():
        return {}
    df = pd.read_csv(OVERRIDES_CSV, dtype=str).fillna("")
    return {r["Name"].strip(): r["Yahoo_Ticker"].strip()
            for _, r in df.iterrows()
            if r["Name"].strip() and _is_ticker(r["Yahoo_Ticker"])}


def save_map(mapping):
    df = pd.DataFrame(sorted(mapping.items()), columns=["Name", "Yahoo_Ticker"])
    df.to_csv(TICKER_MAP_CSV, index=False)
    print(f"Ticker map now holds {len(df)} name(s) → {TICKER_MAP_CSV.name}", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cleaned", type=Path, default=CLEANED_CSV,
                    help=f"filtered output from step #1 (default: {CLEANED_CSV.name})")
    ap.add_argument("--out", type=Path, default=HOLDINGS_CSV,
                    help=f"where to write (default: {HOLDINGS_CSV.name})")
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    if not args.cleaned.exists():
        print(f"ERROR: {args.cleaned} does not exist — run fetch_and_clean_holding.py first.")
        return 1

    df = pd.read_csv(args.cleaned, dtype=str).fillna("")
    if "As_Of" not in df.columns:
        # Without the period we cannot label the data, and an unlabelled holdings file
        # is exactly what let a 2025 download be filed as 2023.
        print(f"ERROR: {args.cleaned.name} has no As_Of column. Re-run "
              f"fetch_and_clean_holding.py, which now records the period it fetched.")
        return 1
    periods = sorted(set(df["As_Of"]))
    if len(periods) != 1:
        print(f"ERROR: expected one period, found {periods}")
        return 1
    period = periods[0]
    print(f"Building holdings for {period}: {len(df)} row(s).", flush=True)

    mapping = load_map()
    overrides = load_overrides()
    if overrides:
        print(f"{len(overrides)} manual override(s) loaded.", flush=True)

    names = df["Name"].str.strip()
    df["Yahoo_Ticker"] = [overrides.get(n) or mapping.get(n, "") for n in names]

    resolved = int((df["Yahoo_Ticker"] != "").sum())
    unresolved = df.loc[df["Yahoo_Ticker"] == "", "Name"].tolist()
    print(f"\nMatched {resolved}/{len(df)} holding(s) to a known ticker.", flush=True)

    if unresolved:
        print(f"{len(unresolved)} name(s) have no ticker yet:", flush=True)
        for n in unresolved[:20]:
            print(f"   - {n}", flush=True)
        if len(unresolved) > 20:
            print(f"   ... and {len(unresolved) - 20} more", flush=True)
        print("Run resolve_tickers.py to look these up, then re-run this script.", flush=True)
    else:
        print("Every holding has a ticker.", flush=True)

    dupes = df.loc[df["Yahoo_Ticker"] != ""].duplicated(subset=["Yahoo_Ticker"], keep=False)
    if dupes.any():
        # Not fatal here — merge_and_enrich.py blanks all but the largest — but it means
        # two companies resolved to one symbol, which resolve_tickers.py exists to fix.
        clash = sorted(set(df.loc[dupes, "Yahoo_Ticker"]))
        print(f"\nWARNING: {len(clash)} ticker(s) claimed by more than one holding: "
              f"{clash[:5]}", flush=True)

    for c in OUTPUT_COLUMNS:
        if c not in df.columns:
            df[c] = ""
    out = df[OUTPUT_COLUMNS]

    if args.dry_run:
        print("\n--dry-run: nothing written.", flush=True)
        return 0

    out.to_csv(args.out, index=False)
    print(f"\nWrote {len(out)} row(s) for {period} → {args.out.name}", flush=True)
    save_map(mapping)
    return 0


if __name__ == "__main__":
    sys.exit(main())
