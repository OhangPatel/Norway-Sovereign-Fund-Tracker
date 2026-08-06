#3  —  Join holdings with market metrics and export the frontend's JSON
"""Runs once per period.

Every period's holdings are joined against the SAME financial_metrics table, because
historical periods display CURRENT market data by design: NBIM's own figures (market
value, ownership, voting) are as of the period, while price, P/E and the rest are
today's. fetch_yahoo_metrics.py therefore fetches the union of tickers across periods.

WHAT GETS WRITTEN
    frontend/public/data-{period}.json   NBIM's figures only — one file per period
    frontend/public/metrics.json         today's market data, keyed by ticker — ONE file

and, only when the period is the newest one available:
    frontend/public/data.json            the chatbot and the static build read this
    data/mega_portfolio_dataset.csv      full dump, committed
    nbim.db enriched_holdings            what backend /api/holdings serves

Backfilling an old period must never disturb what the live site serves, so those three
are keyed on which period is actually newest, not on which one happens to be running.

WHY THE SPLIT
Market data is the same "today" whatever period you are viewing, so storing it inside
each period file would write the same price six times. 819 companies appear in all six
periods; the weekly refresh would then rewrite ~4 MB to change numbers that live in one
place conceptually. Worse, six copies of a price can disagree — this project has already
shipped a chatbot quoting $309.00 while the site said $309.38. One file, one price.

data.json is deliberately exempt: it stays pre-joined so the chatbot and the static
build keep reading exactly what they read today.
"""
import argparse
import pandas as pd
import sqlite3
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATA_DIR = BACKEND_DIR.parent / "data"
FRONTEND_DIR = BACKEND_DIR.parent / "frontend" / "public"
FRONTEND_DATA = FRONTEND_DIR / "data.json"

INPUT_CSV = DATA_DIR / "holdings_with_tickers.csv"
PERIODS_DIR = DATA_DIR / "periods"
OUTPUT_CSV = DATA_DIR / "mega_portfolio_dataset.csv"
DB_PATH = BACKEND_DIR / "nbim.db"


# Which side of the split each exported field belongs to.
# ticker is NBIM-side because it is the join key: the period file has to carry it to
# find its row in metrics.json.
HOLDING_FIELDS = ("country", "name", "ticker", "industry",
                  "mvNok", "mvUsd", "voting", "ownership", "reason")
# frontend name -> financial_metrics column. Single source for both the joined export
# above and metrics.json below, so the two cannot describe the same field differently.
METRIC_COLUMNS = {
    "sector": "sector", "pe": "pe_ratio", "fwdPe": "forward_pe", "pb": "price_to_book",
    "divYield": "dividend_yield", "marketCap": "market_cap",
    "rec": "analyst_recommendation", "targetPrice": "target_mean_price",
    "high52": "high_52w", "low52": "low_52w", "beta": "beta", "price": "price",
    "change": "change", "fetchedAt": "fetched_at",
}
METRIC_FIELDS = tuple(METRIC_COLUMNS)


def write_metrics():
    """Dump financial_metrics to frontend/public/metrics.json, keyed by ticker.

    Written once per run, not per period: it is the union of every period's tickers and
    is what every period joins against. Keyed by ticker so the browser can look a row up
    directly instead of scanning.
    """
    conn = sqlite3.connect(str(DB_PATH))
    df = pd.read_sql("SELECT * FROM financial_metrics", conn)
    conn.close()
    if df.empty:
        print("WARNING: financial_metrics is empty — metrics.json not written.", flush=True)
        return
    if "fetched_at" in df.columns:
        df = (df.sort_values("fetched_at", ascending=False, na_position="last")
                .drop_duplicates(subset=["ticker"], keep="first"))

    out = {}
    for _, row in df.iterrows():
        ticker = str(row["ticker"]).strip()
        if not ticker:
            continue
        out[ticker] = {k: (row[c] if c in df.columns and pd.notna(row[c]) else None)
                       for k, c in METRIC_COLUMNS.items()}
    path = FRONTEND_DIR / "metrics.json"
    path.write_text(json.dumps(out, allow_nan=False, default=lambda _: None))
    print(f"Saved JSON → {path.name} ({len(out)} ticker(s), {path.stat().st_size/1024:.0f} KB)",
          flush=True)


def available_periods():
    """Periods with a built holdings file, oldest first. They sort as ISO dates."""
    if not PERIODS_DIR.exists():
        return []
    return sorted(d.name for d in PERIODS_DIR.iterdir()
                  if d.is_dir() and (d / "holdings_with_tickers.csv").exists())


def write_manifest(periods):
    """List the available periods for the frontend, newest first.

    Exists so the year picker is never a hardcoded list of years. Adding a period is
    then purely a pipeline action: back-fill it, re-export, and it appears in the UI
    with no frontend change at all.

    `half` drives NBIM's own "show historical half-year holdings" toggle — H1 periods
    stay hidden until it is ticked.
    """
    manifest = {
        "latest": periods[-1],
        "periods": [
            {
                "period": p,
                # NBIM's own naming: "2025" for the annual, "H1 2025" for the June one.
                "label": (f"H1 {p[:4]}" if p.endswith("-06-30") else p[:4]),
                "half": p.endswith("-06-30"),
                "rows": len(pd.read_csv(PERIODS_DIR / p / "holdings_with_tickers.csv")),
            }
            for p in reversed(periods)
        ],
    }
    path = FRONTEND_DIR / "periods.json"
    path.write_text(json.dumps(manifest, indent=2))
    print(f"Saved JSON → {path.name} ({len(periods)} periods, latest {periods[-1]})", flush=True)


def merge_and_save(period=None, is_latest=True):
    print("STEP:Loading holdings data...", flush=True)
    print("PROGRESS:1/4", flush=True)

    source = (PERIODS_DIR / period / "holdings_with_tickers.csv") if period else INPUT_CSV
    df_original = pd.read_csv(source)

    # ── Ticker invariant ──────────────────────────────────────────────────────
    # Last gate before export. resolve_tickers.py should already guarantee this,
    # but the CSV is hand-editable and this is where a bad ticker would leak into
    # data.json. Two rules, both learned the hard way:
    #
    #   1. Placeholders are not tickers. "N/A-PRIVATE" was written for 12 unlisted
    #      companies, so the frontend — which keys rows by ticker — treated twelve
    #      different businesses as one holding.
    #   2. A ticker identifies exactly one holding. Duplicates aliased pinning and
    #      comparison in the UI, and made this merge produce ambiguous joins.
    if "Yahoo_Ticker" in df_original.columns:
        SENTINELS = {"N/A-PRIVATE", "N/A", "NA", "UNKNOWN", "ERROR", "ERROR_TIMEOUT", "NONE", "NULL"}
        tick = df_original["Yahoo_Ticker"].astype(str).str.strip()
        bad = tick.str.upper().isin(SENTINELS) | tick.eq("") | tick.eq("nan")
        if bad.any():
            print(f"Blanked {int(bad.sum())} placeholder ticker(s) — unlisted or unresolved.", flush=True)
        df_original["Yahoo_Ticker"] = tick.mask(bad, None)

        real = df_original["Yahoo_Ticker"].notna()
        dup = real & df_original.duplicated(subset=["Yahoo_Ticker"], keep=False)
        if dup.any():
            # Keep the ticker on the largest position and blank the rest, so the
            # join stays 1:1. Loud, because it means resolve_tickers.py needs a rerun.
            names = df_original.loc[dup, "Yahoo_Ticker"].unique().tolist()
            print(f"WARNING: {len(names)} ticker(s) claimed by multiple holdings: {names}", flush=True)
            print("         Keeping the largest position for each; run resolve_tickers.py to fix properly.", flush=True)
            order = df_original["Market Value(NOK)"] if "Market Value(NOK)" in df_original.columns else df_original.index
            keep = (
                df_original.loc[dup]
                .assign(_o=pd.to_numeric(order.loc[dup], errors="coerce").fillna(0))
                .sort_values("_o", ascending=False)
                .drop_duplicates(subset=["Yahoo_Ticker"], keep="first")
                .index
            )
            df_original.loc[dup & ~df_original.index.isin(keep), "Yahoo_Ticker"] = None

    conn = sqlite3.connect(str(DB_PATH))
    df_metrics = pd.read_sql("SELECT * FROM financial_metrics", conn)

    # Guard: deduplicate metrics so a corrupted DB never produces Cartesian-product duplicates.
    # Keep the most recently fetched row per ticker.
    if not df_metrics.empty and 'fetched_at' in df_metrics.columns:
        df_metrics = (
            df_metrics
            .sort_values('fetched_at', ascending=False, na_position='last')
            .drop_duplicates(subset=['ticker'], keep='first')
            .reset_index(drop=True)
        )

    print("STEP:Merging holdings with metrics...", flush=True)
    print("PROGRESS:2/4", flush=True)

    df_merged = pd.merge(
        df_original,
        df_metrics,
        left_on="Yahoo_Ticker",
        right_on="ticker",
        how="left"
    )

    columns_to_drop = []

    if 'ticker' in df_merged.columns:
        columns_to_drop.append('ticker')

    if 'Industry' in df_merged.columns and 'industry' in df_merged.columns:
        columns_to_drop.append('industry')

    if 'industry_y' in df_merged.columns:
        columns_to_drop.append('industry_y')
        df_merged.rename(columns={'industry_x': 'industry'}, inplace=True)

    if columns_to_drop:
        df_merged = df_merged.drop(columns=columns_to_drop)

    # Final guard: if the merge still produced duplicate rows (e.g. same Yahoo_Ticker in
    # holdings CSV), keep only the first occurrence so the output is 1 row per holding.
    rows_before = len(df_merged)
    df_merged = df_merged.drop_duplicates(keep='first').reset_index(drop=True)
    if len(df_merged) < rows_before:
        print(f"Deduplication removed {rows_before - len(df_merged)} duplicate rows.", flush=True)

    print("STEP:Saving to CSV and database...", flush=True)
    print("PROGRESS:3/4", flush=True)

    if is_latest:
        df_merged.to_csv(OUTPUT_CSV, index=False)
        df_merged.to_sql("enriched_holdings", conn, if_exists="replace", index=False)
    conn.close()

    print("STEP:Exporting data.json for frontend...", flush=True)
    print("PROGRESS:4/4", flush=True)

    col = df_merged.columns.tolist()

    def get(row, *names):
        for n in names:
            if n in col:
                v = row[n]
                if pd.notna(v):
                    return v
        return None

    records = []
    for _, row in df_merged.iterrows():
        records.append({
            "country":     get(row, "Country", "country"),
            "name":        get(row, "Name", "name"),
            "ticker":      get(row, "Yahoo_Ticker"),
            "industry":    get(row, "Industry", "industry"),
            "sector":      get(row, "sector"),
            "mvNok":       get(row, "Market Value(NOK)"),
            "mvUsd":       get(row, "Market Value(USD)"),
            "voting":      get(row, "Voting"),
            "ownership":   get(row, "Ownership"),
            "reason":      get(row, "Selection Reason"),
            "pe":          get(row, "pe_ratio"),
            "fwdPe":       get(row, "forward_pe"),
            "pb":          get(row, "price_to_book"),
            "divYield":    get(row, "dividend_yield"),
            "marketCap":   get(row, "market_cap"),
            "rec":         get(row, "analyst_recommendation"),
            "targetPrice": get(row, "target_mean_price"),
            "high52":      get(row, "high_52w"),
            "low52":       get(row, "low_52w"),
            "beta":        get(row, "beta"),
            "price":       get(row, "price"),
            "change":      get(row, "change"),
            "fetchedAt":   get(row, "fetched_at"),
        })

    # Invariant: every exported field belongs to exactly one side of the split. If a
    # new field is added above and not classified, this fails here rather than silently
    # dropping it out of the per-period files.
    unclassified = set(records[0]) - set(HOLDING_FIELDS) - set(METRIC_FIELDS)
    if unclassified:
        raise RuntimeError(f"Unclassified export field(s): {sorted(unclassified)} — add "
                           f"each to HOLDING_FIELDS or METRIC_FIELDS.")

    # data.json stays whole. The chatbot reads it directly and build-static.mjs builds
    # the SEO pages from it; neither should have to know the split exists.
    if is_latest:
        FRONTEND_DATA.write_text(json.dumps(records, allow_nan=False, default=lambda _: None))
        print(f"Saved JSON → {FRONTEND_DATA.name} (joined, for the chatbot and SEO pages)",
              flush=True)
        print(f"Saved CSV  → {OUTPUT_CSV.name}", flush=True)

    if period:
        # NBIM's figures only. These are as of the period and never change again, so
        # this file is written once and left alone by every later price refresh.
        holdings = [{k: r[k] for k in HOLDING_FIELDS} for r in records]
        (FRONTEND_DIR / f"data-{period}.json").write_text(
            json.dumps(holdings, allow_nan=False, default=lambda _: None))
        print(f"Saved JSON → data-{period}.json ({len(HOLDING_FIELDS)} NBIM fields)", flush=True)

    print(f"Success! Merged {len(df_merged)} rows"
          f"{' for ' + period if period else ''}.", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--period", help="one period, e.g. 2024-12-31")
    g.add_argument("--all", action="store_true", help="every period under data/periods/")
    args = ap.parse_args()

    periods = available_periods()
    if not periods:
        # Pre-Phase-2 layout: one holdings file, one data.json. Still works.
        merge_and_save()
        return 0

    newest = periods[-1]
    if args.all:
        targets = periods
    elif args.period:
        if args.period not in periods:
            print(f"ERROR: no built holdings for {args.period}. Available: {periods}")
            return 1
        targets = [args.period]
    else:
        targets = [newest]

    for p in targets:
        print(f"\n=== {p}{' (latest)' if p == newest else ''} ===", flush=True)
        merge_and_save(period=p, is_latest=(p == newest))

    # Once, after the periods: shared by all of them and dependent on none.
    print("\n=== shared market data ===", flush=True)
    write_metrics()
    write_manifest(periods)
    return 0


if __name__ == "__main__":
    sys.exit(main())
