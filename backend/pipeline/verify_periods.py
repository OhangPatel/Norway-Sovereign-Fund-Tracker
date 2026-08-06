# 4  —  Check the multi-period data is sound
"""Re-runnable checks over the per-period holdings and the exported JSON.

Run this after any pipeline change, not just once:

    python backend/pipeline/verify_periods.py

Exits 0 if everything holds, 1 with a named failure otherwise. Every check here exists
because the failure it catches has either happened in this project or came within one
step of shipping:

  - a holdings file and its exported JSON silently disagreeing on row count
  - one ticker claimed by two companies, which aliases them everywhere downstream
  - a holding whose ticker has no entry in metrics.json, so it renders with no price
  - a restructuring quietly altering NBIM's own figures, which are the one thing in
    this project that must never change after publication
"""
import json
import subprocess
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent.parent
PERIODS_DIR = ROOT / "data" / "periods"
FRONTEND = ROOT / "frontend" / "public"
# Must match merge_and_enrich.HOLDING_FIELDS. Duplicated deliberately: this script is
# the independent check, so importing the value it is meant to verify would defeat it.
HOLDING_FIELDS = {"country", "name", "ticker", "industry",
                  "mvNok", "mvUsd", "voting", "ownership", "reason"}

failures = []
notes = []


def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'  — ' + detail if detail else ''}")
    if not ok:
        failures.append(name)


def committed(path):
    """The version of `path` at git HEAD, or None if it is not committed yet."""
    r = subprocess.run(["git", "-C", str(ROOT), "show", f"HEAD:{path}"],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def main():
    periods = sorted(d.name for d in PERIODS_DIR.iterdir()
                     if d.is_dir() and (d / "holdings_with_tickers.csv").exists()) \
        if PERIODS_DIR.exists() else []
    if not periods:
        print("No periods found under data/periods/ — nothing to verify.")
        return 1

    print(f"\n{len(periods)} period(s): {', '.join(periods)}\n")

    metrics_path = FRONTEND / "metrics.json"
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else None
    if metrics is None:
        notes.append("metrics.json does not exist yet — price-coverage checks skipped. "
                     "Run merge_and_enrich.py once the metrics fetch has completed.")

    print("── per period ──")
    all_tickers = set()
    for p in periods:
        csv = pd.read_csv(PERIODS_DIR / p / "holdings_with_tickers.csv", dtype=str).fillna("")

        # The period must be recorded in the data, not merely in the directory name.
        recorded = set(csv["As_Of"]) if "As_Of" in csv.columns else set()
        check(f"{p}: As_Of matches its directory", recorded == {p},
              f"file says {sorted(recorded) or 'nothing'}")

        tickers = [t.strip() for t in csv["Yahoo_Ticker"] if t.strip()]
        all_tickers |= set(tickers)
        dupes = sorted({t for t in tickers if tickers.count(t) > 1})
        check(f"{p}: no ticker claimed twice", not dupes, f"{dupes[:5]}" if dupes else "")

        jpath = FRONTEND / f"data-{p}.json"
        if not jpath.exists():
            check(f"{p}: exported JSON exists", False, f"{jpath.name} missing")
            continue
        rows = json.loads(jpath.read_text())
        check(f"{p}: JSON row count matches holdings", len(rows) == len(csv),
              f"{len(rows)} JSON vs {len(csv)} CSV")
        check(f"{p}: JSON carries only NBIM fields", set(rows[0]) == HOLDING_FIELDS,
              f"unexpected {sorted(set(rows[0]) - HOLDING_FIELDS)}" if rows else "")

        # Coverage is reported, not enforced. Yahoo genuinely serves no data for some
        # valid symbols — production ships 62 such holdings today — so demanding full
        # coverage would fail on correct data. The regression check that DOES bite is
        # the like-for-like comparison against the committed data.json further down.
        priced = ""
        if metrics is not None:
            jt = {r["ticker"] for r in rows if r.get("ticker")}
            have = len(jt & set(metrics))
            priced = f", {have} of those priced ({100 * have / len(jt):.0f}%)" if jt else ""
        pct = 100 * len(set(tickers)) / len(csv)
        print(f"        {len(csv)} holdings, {len(set(tickers))} with a ticker "
              f"({pct:.0f}%){priced}")

    if metrics is not None:
        print("\n── shared metrics ──")
        check("metrics.json has no ticker no period uses", not (set(metrics) - all_tickers),
              f"{len(set(metrics) - all_tickers)} orphaned")
        stamps = {m.get("fetchedAt") for m in metrics.values() if m.get("fetchedAt")}
        if stamps:
            # A spread of more than a day means rows survived from an earlier run that
            # this one could not refresh. CI cannot produce that — it starts from an
            # empty database — so it would be a local artifact shipping as "current".
            check("all metrics come from one fetch", min(stamps)[:10] == max(stamps)[:10],
                  f"{min(stamps)[:10]} → {max(stamps)[:10]}")
            print(f"        {len(metrics)} tickers, fetched {min(stamps)[:16]} → {max(stamps)[:16]}")
        print(f"        {len(all_tickers - set(metrics))} ticker(s) Yahoo returned nothing for")

    # The check that matters most: restructuring must not move a single NBIM figure.
    print("\n── data.json vs the committed version ──")
    old_raw = committed("frontend/public/data.json")
    if old_raw is None:
        notes.append("data.json is not committed — skipped the NBIM-figures comparison.")
    else:
        old = {r["name"]: r for r in json.loads(old_raw)}
        new = {r["name"]: r for r in json.loads((FRONTEND / "data.json").read_text())}
        check("same set of holdings", set(old) == set(new),
              f"+{len(set(new)-set(old))} -{len(set(old)-set(new))}")
        moved = [n for n in set(old) & set(new)
                 if any(old[n].get(f) != new[n].get(f) for f in HOLDING_FIELDS)]
        check("NBIM figures unchanged", not moved,
              f"{len(moved)} row(s) moved, e.g. {moved[:3]}" if moved else "")

        # Prices are meant to move; how MANY holdings have one is not. A drop here means
        # the restructuring lost market data rather than refreshed it.
        was = sum(1 for r in json.loads(old_raw) if r.get("price") is None)
        now = sum(1 for r in new.values() if r.get("price") is None)
        check("price coverage did not regress", now <= was,
              f"{was} unpriced before, {now} now")

    print()
    for n in notes:
        print(f"  NOTE: {n}")
    if failures:
        print(f"\n{len(failures)} check(s) FAILED: {failures}")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
