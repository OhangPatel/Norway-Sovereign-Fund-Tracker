# 2  —  Name → Yahoo ticker resolution
"""Assigns the Yahoo_Ticker column: the step between #1 (fetch_and_clean_holding)
and #3 (fetch_yahoo_metrics).

WHY THIS EXISTS
NBIM publishes no ISIN, CUSIP or ticker — only a company NAME. So the ticker has
to be looked up from text, and text matching is the whole problem: searching
"Canada Packers Inc" returns its former parent George Weston (WN.TO) as a strong
hit, because the two really are related. Whatever produced the original
holdings_with_tickers.csv trusted that answer without checking it, which is how
one ticker ended up on two different companies.

THE RULE THAT PREVENTS IT RECURRING
Never trust a search hit. For every candidate we check that
  (a) it trades on the exchange the holding's country implies, and
  (b) the name the exchange reports actually matches the holding's name.
If nothing clears the bar we write a BLANK ticker. A blank is honest and the app
handles it; a wrong ticker silently corrupts a row and collides with another.

MODES
  (default)  repair — only touch rows that fail validation. The ~1,410 mappings
             that already verify are left exactly as they are, so a fix for 20
             rows can never regress the rest.
  --all      re-resolve every row from scratch. Slow (one search per holding,
             rate-limited) and only worth it if you suspect systemic drift.
  --dry-run  report what would change, write nothing.

Manual corrections live in data/ticker_overrides.csv and always win.
"""
import argparse
import csv
import re
import sys
import time
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd
import yfinance as yf

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent.parent / "data"
HOLDINGS_CSV = DATA_DIR / "holdings_with_tickers.csv"
OVERRIDES_CSV = DATA_DIR / "ticker_overrides.csv"

# Values that mean "no ticker" but were written as if they were one. The bare
# string is the bug: 12 unlisted companies all shared "N/A-PRIVATE", so the app
# treated twelve different businesses as a single holding.
SENTINELS = {"", "N/A-PRIVATE", "N/A", "NA", "UNKNOWN", "ERROR", "ERROR_TIMEOUT", "NONE", "NULL"}

# A holding in country X must resolve to X's exchange. This alone rejects most
# bad hits: searching an Indian subsidiary's name often surfaces the German or
# US listing of the parent group first.
COUNTRY_SUFFIX = {
    "Canada": (".TO", ".V"),
    "Germany": (".DE", ".F"),
    "India": (".NS", ".BO"),
    "Singapore": (".SI",),
    "United Kingdom": (".L",),
    "United States": ("",),          # US symbols carry no suffix
}

MATCH_THRESHOLD = 0.72   # below this we refuse to guess
SEARCH_PAUSE = 1.5       # seconds between searches, matching the API's yfinance throttle

# Legal-form noise that carries no identifying signal.
_NOISE = re.compile(
    r"\b(ltd|limited|inc|incorporated|corp|corporation|co|company|plc|ag|se|sa|nv|"
    r"holdings?|group|the|class|cl|series|new|adr|reit|spa|asa|ab|oyj|pcl|bhd|tbk)\b",
    re.I,
)


def norm(name: str) -> str:
    s = (name or "").lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = _NOISE.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


def similarity(a: str, b: str) -> float:
    """0..1 name agreement. Token containment is rewarded because exchanges
    abbreviate ('Tata Motors Passenger Vehicles' vs 'Tata Motors PV')."""
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    ratio = SequenceMatcher(None, na, nb).ratio()
    ta, tb = set(na.split()), set(nb.split())
    if ta and tb:
        overlap = len(ta & tb) / min(len(ta), len(tb))
        ratio = max(ratio, overlap * 0.95 if ta <= tb or tb <= ta else overlap * 0.85)
    return ratio


def suffix_ok(symbol: str, country: str) -> bool:
    allowed = COUNTRY_SUFFIX.get(country)
    if not allowed:
        return True                      # unknown country: don't over-constrain
    if allowed == ("",):
        return "." not in symbol         # US
    return any(symbol.endswith(s) for s in allowed)


def search_candidates(name: str, country: str):
    """Yahoo hits for `name`, filtered to the country's exchange, best first."""
    try:
        quotes = yf.Search(name, max_results=12).quotes or []
    except Exception as e:                                   # network/rate-limit
        print(f"    search failed for {name!r}: {type(e).__name__}", flush=True)
        return []
    out = []
    for q in quotes:
        sym = (q.get("symbol") or "").strip()
        if not sym or q.get("quoteType") != "EQUITY" or not suffix_ok(sym, country):
            continue
        listed = q.get("longname") or q.get("shortname") or ""
        out.append((similarity(name, listed), sym, listed))
    out.sort(reverse=True, key=lambda x: x[0])
    return out


def verify(symbol: str, name: str, country: str) -> float:
    """Confidence that `symbol` really is `name`. 0 means reject."""
    if not symbol or not suffix_ok(symbol, country):
        return 0.0
    try:
        info = yf.Ticker(symbol).info or {}
    except Exception:
        return 0.0
    listed = info.get("longName") or info.get("shortName") or ""
    return similarity(name, listed) if listed else 0.0


def load_overrides() -> dict:
    if not OVERRIDES_CSV.exists():
        return {}
    with OVERRIDES_CSV.open(newline="", encoding="utf-8") as f:
        return {
            r["Name"].strip(): r["Yahoo_Ticker"].strip()
            for r in csv.DictReader(f)
            if r.get("Name", "").strip()
        }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--all", action="store_true", help="re-resolve every row, not just broken ones")
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    df = pd.read_csv(HOLDINGS_CSV, dtype=str).fillna("")
    if "Yahoo_Ticker" not in df.columns:
        df["Yahoo_Ticker"] = ""
    overrides = load_overrides()
    print(f"Loaded {len(df)} holdings, {len(overrides)} manual override(s).", flush=True)

    df["Yahoo_Ticker"] = df["Yahoo_Ticker"].str.strip()
    # Sentinels are not tickers. Clear them before anything else so they can
    # neither collide with each other nor be mistaken for a real symbol.
    sentinel_mask = df["Yahoo_Ticker"].str.upper().isin(SENTINELS)
    print(f"Cleared {int(sentinel_mask.sum())} placeholder ticker(s).", flush=True)
    df.loc[sentinel_mask, "Yahoo_Ticker"] = ""

    # Which rows are suspect? Anything blank, plus every member of a duplicate set.
    counts = df.loc[df["Yahoo_Ticker"] != "", "Yahoo_Ticker"].value_counts()
    dupes = set(counts[counts > 1].index)
    suspect = df.index[(df["Yahoo_Ticker"] == "") | df["Yahoo_Ticker"].isin(dupes)]
    targets = df.index if args.all else suspect
    print(f"{len(dupes)} ticker(s) claimed by more than one holding.", flush=True)
    print(f"Resolving {len(targets)} row(s) ({'all' if args.all else 'repair mode'}).\n", flush=True)

    # A ticker already held by a row we are NOT touching stays claimed.
    claimed = {}
    for i, t in df["Yahoo_Ticker"].items():
        if t and i not in set(targets):
            claimed[t] = i

    changes = []
    for n, i in enumerate(targets, 1):
        name = df.at[i, "Name"]
        country = df.at[i, "Country"]
        current = df.at[i, "Yahoo_Ticker"]

        if name in overrides:
            chosen, why = overrides[name], "override"
        else:
            # An existing ticker keeps its row only if it actually verifies.
            score = verify(current, name, country) if current else 0.0
            if score >= MATCH_THRESHOLD and current not in claimed:
                chosen, why = current, f"kept (verified {score:.2f})"
            else:
                time.sleep(SEARCH_PAUSE)
                chosen, why = "", "unresolved"
                for cand_score, sym, listed in search_candidates(name, country):
                    if cand_score < MATCH_THRESHOLD or sym in claimed:
                        continue
                    chosen, why = sym, f"matched {listed!r} ({cand_score:.2f})"
                    break

        if chosen:
            claimed[chosen] = i
        if chosen != current:
            changes.append((name, country, current or "(blank)", chosen or "(blank)", why))
        df.at[i, "Yahoo_Ticker"] = chosen
        print(f"  [{n}/{len(targets)}] {name[:44]:44} {current or '(blank)':>14} -> {chosen or '(blank)':<14} {why}", flush=True)

    # Final invariant. Nothing leaves this script with a shared ticker.
    final = df.loc[df["Yahoo_Ticker"] != "", "Yahoo_Ticker"].value_counts()
    still_dup = final[final > 1]
    if len(still_dup):
        print(f"\nERROR: {len(still_dup)} ticker(s) still duplicated: {list(still_dup.index)}", file=sys.stderr)
        return 1

    print(f"\n{len(changes)} row(s) changed. Every non-blank ticker is unique.", flush=True)
    blanks = int((df["Yahoo_Ticker"] == "").sum())
    print(f"{blanks} holding(s) have no ticker (unlisted or unresolved) — expected and handled downstream.", flush=True)

    if args.dry_run:
        print("\n--dry-run: nothing written.", flush=True)
        return 0

    df.to_csv(HOLDINGS_CSV, index=False)
    print(f"Wrote {HOLDINGS_CSV}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
