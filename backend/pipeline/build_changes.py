# 5  —  What NBIM added and removed between consecutive periods
"""Writes frontend/public/changes-{period}.json, one per period after the first.

TWO LEVELS, AND THEY ARE NOT THE SAME THING
  raw       every company NBIM holds (7,000-9,000). Entering or leaving this list means
            NBIM actually opened or closed a position. This is the real story.
  filtered  the ~1,430 this site tracks, chosen as the top N by ownership and market
            value per country+industry. A company crossing that boundary looks exactly
            like a trade but is not one.

Keeping them apart is the whole point. Over 2025-06-30 -> 2025-12-31 the filtered set
moved +209/-206 — near-symmetric, which reads as routine churn. The raw list moved
+479/-1652: NBIM cut about 1,173 companies. Reporting the filtered numbers as "what they
bought and sold" would have described the opposite of what happened, because a top-N cut
of a shrinking list stays roughly the same size by construction.

RENAMES
A name-keyed diff cannot tell a rename from a sale plus a purchase — NBIM publishes no
ISIN, only a name, so "Facebook Inc" leaving and "Meta Platforms Inc" arriving looks like
two trades. Where both names resolve to the SAME ticker we collapse the pair. That only
works on the filtered set, which has tickers; the raw list mostly does not, so its counts
carry an honest caveat rather than a false precision.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import pandas as pd

_WS = re.compile(r"\s+")


def match_key(name):
    """The key companies are matched on across periods.

    Case-folded and whitespace-collapsed, because NBIM's own capitalisation is not
    stable between publications. Matching the raw string reported 16 add/remove pairs
    across these six periods that were nothing but a changed letter — "SK Hynix Inc"
    becoming "SK hynix Inc" showed up as a $2.6B sale AND a $4.9B purchase, neither of
    which happened. On a panel whose entire claim is "this is what the fund bought and
    sold", that is not a rounding error.

    The original spelling is kept alongside for display; only matching is normalised.
    """
    return _WS.sub(" ", str(name)).strip().lower()

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent.parent
PERIODS_DIR = ROOT / "data" / "periods"
FRONTEND_DIR = ROOT / "frontend" / "public"

# Per side, per level. The full removed list can run to 1,652 companies; carrying every
# one would put ~200 KB in a file the page loads just to show a headline. The largest
# positions are what anyone actually reads, and the counts above them stay exact.
TOP_N = 100


def periods():
    if not PERIODS_DIR.exists():
        return []
    return sorted(d.name for d in PERIODS_DIR.iterdir()
                  if d.is_dir() and (d / "roster.csv").exists())


def load_roster(period):
    """match_key -> {name, country, industry, mvUsd} for everything NBIM held."""
    df = pd.read_csv(PERIODS_DIR / period / "roster.csv", dtype={"Name": str})
    out = {}
    for _, r in df.iterrows():
        name = str(r["Name"]).strip()
        if not name:
            continue
        mv = r["mvUsd"]
        out[match_key(name)] = {
            "name": name,
            "country": None if pd.isna(r["Country"]) else str(r["Country"]),
            "industry": None if pd.isna(r["Industry"]) else str(r["Industry"]),
            "mvUsd": None if pd.isna(mv) else int(mv),
        }
    return out


def load_filtered(period):
    """match_key -> {name, country, industry, mvUsd, ticker} for the tracked set."""
    path = PERIODS_DIR / period / "holdings_with_tickers.csv"
    if not path.exists():
        return {}
    df = pd.read_csv(path, dtype=str).fillna("")
    out = {}
    for _, r in df.iterrows():
        name = r["Name"].strip()
        if not name:
            continue
        try:
            mv = int(float(r["Market Value(USD)"]))
        except (ValueError, TypeError):
            mv = None
        out[match_key(name)] = {
            "name": name,
            "country": r["Country"] or None,
            "industry": r["Industry"] or None,
            "mvUsd": mv,
            "ticker": r["Yahoo_Ticker"].strip() or None,
        }
    return out


def biggest(keys, source):
    """Entries sorted by position size, largest first. Unsized companies sort last."""
    rows = [{"name": source[k]["name"], "country": source[k]["country"],
             "industry": source[k]["industry"], "mvUsd": source[k]["mvUsd"]}
            for k in keys if k in source]
    rows.sort(key=lambda r: (r["mvUsd"] is None, -(r["mvUsd"] or 0)))
    return rows


def suppress_renames(added, removed, curr, prev):
    """Drop add/remove pairs that are one company under two names.

    A ticker present on both sides is the same listed company, so the pair is a rename
    (Facebook -> Meta), a re-registration ("Tata Motors Ltd /new"), or a share-class
    relabel — not a sale and a purchase. Only the tracked set has tickers.
    """
    added_by_ticker = {curr[k]["ticker"]: k for k in added if curr.get(k, {}).get("ticker")}
    removed_by_ticker = {prev[k]["ticker"]: k for k in removed if prev.get(k, {}).get("ticker")}
    shared = set(added_by_ticker) & set(removed_by_ticker)
    pairs = [{"ticker": t,
              "from": prev[removed_by_ticker[t]]["name"],
              "to": curr[added_by_ticker[t]]["name"]}
             for t in sorted(shared)]
    drop_added = {added_by_ticker[t] for t in shared}
    drop_removed = {removed_by_ticker[t] for t in shared}
    return (added - drop_added), (removed - drop_removed), pairs


def build(curr, prev):
    raw_c, raw_p = load_roster(curr), load_roster(prev)
    raw_added = set(raw_c) - set(raw_p)
    raw_removed = set(raw_p) - set(raw_c)

    flt_c, flt_p = load_filtered(curr), load_filtered(prev)
    flt_added = set(flt_c) - set(flt_p)
    flt_removed = set(flt_p) - set(flt_c)
    flt_added, flt_removed, renames = suppress_renames(flt_added, flt_removed, flt_c, flt_p)

    return {
        "period": curr,
        "previous": prev,
        "raw": {
            "heldNow": len(raw_c),
            "heldBefore": len(raw_p),
            "added": len(raw_added),
            "removed": len(raw_removed),
            "addedTop": biggest(raw_added, raw_c)[:TOP_N],
            "removedTop": biggest(raw_removed, raw_p)[:TOP_N],
        },
        "filtered": {
            "trackedNow": len(flt_c),
            "trackedBefore": len(flt_p),
            "added": len(flt_added),
            "removed": len(flt_removed),
            "addedTop": biggest(flt_added, flt_c)[:TOP_N],
            "removedTop": biggest(flt_removed, flt_p)[:TOP_N],
            "renamesSuppressed": len(renames),
            "renames": renames,
        },
        "topN": TOP_N,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--period", help="build one period instead of all")
    args = ap.parse_args()

    known = periods()
    if len(known) < 2:
        print(f"Need at least two periods with a roster; found {len(known)}.")
        return 1

    # Each period is compared with the one immediately before it, so the steps are six
    # months apart wherever half-year data exists and twelve months before that.
    pairs = list(zip(known[1:], known))
    if args.period:
        pairs = [p for p in pairs if p[0] == args.period]
        if not pairs:
            print(f"ERROR: {args.period} has no predecessor to compare against.")
            return 1

    for curr, prev in pairs:
        data = build(curr, prev)
        path = FRONTEND_DIR / f"changes-{curr}.json"
        path.write_text(json.dumps(data, separators=(",", ":")))
        r, f = data["raw"], data["filtered"]
        print(f"{prev} -> {curr}", flush=True)
        print(f"    raw       +{r['added']:<5} -{r['removed']:<5} "
              f"({r['heldBefore']} -> {r['heldNow']} companies)", flush=True)
        print(f"    filtered  +{f['added']:<5} -{f['removed']:<5} "
              f"({f['trackedBefore']} -> {f['trackedNow']} tracked"
              f"{', ' + str(f['renamesSuppressed']) + ' rename(s) suppressed' if f['renamesSuppressed'] else ''})",
              flush=True)
        print(f"    → {path.name} ({path.stat().st_size / 1024:.0f} KB)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
