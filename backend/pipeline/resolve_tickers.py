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
TICKER_MAP_CSV = DATA_DIR / "ticker_map.csv"
UNRESOLVED_CSV = DATA_DIR / "unresolved_names.csv"

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
SEARCH_PAUSE = 8.0       # Yahoo silently returns EMPTY result sets when throttled,
                         # so pace conservatively: a repair run is rare and slow is fine

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
    """0..1 name agreement.

    Token overlap is measured against the LONGER name on purpose. Dividing by the
    shorter one makes a parent's name score ~1.0 against its subsidiary — "Siemens
    Energy India" vs "Siemens" shares one token out of one, which is precisely the
    false match that put two companies on SIEMENS.NS in the first place. Scoring
    against the longer name means unexplained extra words cost you.
    """
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    ta, tb = set(na.split()), set(nb.split())
    if not ta or not tb:
        return 0.0
    coverage = len(ta & tb) / max(len(ta), len(tb))
    return max(SequenceMatcher(None, na, nb).ratio(), coverage)


def suffix_ok(symbol: str, country: str) -> bool:
    allowed = COUNTRY_SUFFIX.get(country)
    if not allowed:
        return True                      # unknown country: don't over-constrain
    if allowed == ("",):
        return "." not in symbol         # US
    return any(symbol.endswith(s) for s in allowed)


# Registry bookkeeping, not part of the company's name: "Tata Motors Ltd /new",
# "GCI Liberty Inc/DEL". Left in the query it derails the search.
_QUERY_CRUFT = re.compile(r"\s*/\s*(new|del|old|de|cl\s*[a-z])\b.*$", re.I)


def _search_raw(query: str):
    """Yahoo's search returns an EMPTY LIST when it throttles you — the same shape
    as a genuine no-match. Taking that at face value silently marks real companies
    as unlisted (it hid TATACAP.NS, TENNIND.NS and SANOFICONR.BO on the first run).
    So retry an empty result with backoff; only a repeated empty means 'no match'."""
    delay = 4.0
    for attempt in range(3):
        try:
            quotes = yf.Search(query, max_results=12).quotes or []
        except Exception as e:
            print(f"    search error ({type(e).__name__}), retrying", flush=True)
            quotes = []
        if quotes:
            return quotes
        if attempt < 2:
            time.sleep(delay)
            delay *= 2
    return []


def search_candidates(name: str, country: str):
    """Yahoo hits for `name`, filtered to the country's exchange, best first."""
    query = _QUERY_CRUFT.sub("", name or "").strip() or name
    quotes = _search_raw(query)
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


def resolve_name_list(dry_run: bool) -> int:
    """Work through data/unresolved_names.csv and append hits to data/ticker_map.csv.

    Exists because holdings are now kept per period. A company held in four periods
    appears in four files, but resolving is the slow, rate-limited step, so it must
    cost exactly one lookup. The ledger is the union of every period's unmatched
    names, and the map it feeds is shared by all of them.

    Same bar as the repair path above: a candidate must clear MATCH_THRESHOLD against
    the exchange's own name, and a ticker already spoken for is never handed to a
    second company. Anything that does not clear the bar is left for the next run —
    many of the oldest names are delisted or acquired and never will.
    """
    if not UNRESOLVED_CSV.exists():
        print(f"{UNRESOLVED_CSV.name} does not exist — nothing to resolve.", flush=True)
        return 0

    pending = pd.read_csv(UNRESOLVED_CSV, dtype=str).fillna("")
    mapping = {}
    if TICKER_MAP_CSV.exists():
        tm = pd.read_csv(TICKER_MAP_CSV, dtype=str).fillna("")
        mapping = {r["Name"].strip(): r["Yahoo_Ticker"].strip() for _, r in tm.iterrows()
                   if r["Name"].strip() and r["Yahoo_Ticker"].strip()}
    overrides = load_overrides()
    mapping.update({k: v for k, v in overrides.items() if v})
    claimed = set(mapping.values())

    todo = [(r["Name"].strip(), r["Country"].strip(), r.get("First_Seen", "").strip())
            for _, r in pending.iterrows()
            if r["Name"].strip() and r["Name"].strip() not in mapping]
    print(f"{len(mapping)} name(s) already mapped. Resolving {len(todo)}.", flush=True)
    print(f"About {len(todo) * SEARCH_PAUSE / 60:.0f} minutes at the current pace.\n", flush=True)

    found = 0
    for n, (name, country, first_seen) in enumerate(todo, 1):
        time.sleep(SEARCH_PAUSE)
        chosen, why = "", "unresolved"
        for score, sym, listed in search_candidates(name, country):
            if score < MATCH_THRESHOLD or sym in claimed:
                continue
            chosen, why = sym, f"matched {listed!r} ({score:.2f})"
            break
        if chosen:
            mapping[name] = chosen
            claimed.add(chosen)
            found += 1
        print(f"  [{n}/{len(todo)}] {first_seen} {name[:40]:40} -> {chosen or '(blank)':<14} {why}",
              flush=True)
        # Written every 25 so a long run that is interrupted keeps what it has earned.
        if found and n % 25 == 0 and not dry_run:
            _write_map(mapping)

    print(f"\nResolved {found} of {len(todo)}. {len(todo) - found} still have no ticker.", flush=True)
    if dry_run:
        print("--dry-run: nothing written.", flush=True)
        return 0
    _write_map(mapping)
    print("Re-run build_holdings.py for each period to attach the new tickers.", flush=True)
    return 0


def _write_map(mapping: dict) -> None:
    """Persist the map.

    Writes every known name, including ones that also have a manual override. Dropping
    those would fight build_holdings.py's save_map(), which keeps them: the two writers
    would then add and remove the same six rows on alternate runs. Redundancy is
    harmless here because every reader consults ticker_overrides.csv first.
    """
    rows = sorted((n, t) for n, t in mapping.items() if t)
    pd.DataFrame(rows, columns=["Name", "Yahoo_Ticker"]).to_csv(TICKER_MAP_CSV, index=False)
    print(f"    ...saved {len(rows)} mapping(s) to {TICKER_MAP_CSV.name}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--all", action="store_true", help="re-resolve every row, not just broken ones")
    ap.add_argument("--names", action="store_true",
                    help=f"resolve {UNRESOLVED_CSV.name} into {TICKER_MAP_CSV.name} "
                         f"instead of repairing {HOLDINGS_CSV.name}")
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    if args.names:
        return resolve_name_list(args.dry_run)

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
    unverified_overrides = []
    for n, i in enumerate(targets, 1):
        name = df.at[i, "Name"]
        country = df.at[i, "Country"]
        current = df.at[i, "Yahoo_Ticker"]

        if name in overrides:
            # A human asserted this, so it wins over the search — that is the whole
            # point of the file. But it still gets checked: an override was the one
            # path into this script that nothing validated, which is exactly the
            # unverified-trust hole that produced the original bad tickers. A typo
            # here is honoured, but never silently.
            chosen = overrides[name]
            score = verify(chosen, name, country)
            if score >= MATCH_THRESHOLD:
                why = f"override (verified {score:.2f})"
            else:
                why = f"override (UNVERIFIED {score:.2f} — CHECK THIS)"
                unverified_overrides.append((name, chosen, score))
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

    if unverified_overrides:
        print(f"\nWARNING: {len(unverified_overrides)} override(s) did not match the exchange's own name:", file=sys.stderr)
        for nm, sym, sc in unverified_overrides:
            print(f"    {nm} -> {sym} (score {sc:.2f}) — verify data/ticker_overrides.csv", file=sys.stderr)

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
