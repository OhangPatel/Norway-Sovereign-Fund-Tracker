"""In-memory holdings dataset + the query operations the chatbot's tools expose.

Loads the same data.json the frontend uses (NBIM holdings) once at startup and
answers structured questions over it deterministically — the model phrases the
answer but never invents the numbers. Pure Python: no pandas, no database.
"""
import json
import logging
import math
import re
from pathlib import Path

import config

log = logging.getLogger("chatbot.data")

# Numeric fields usable for sorting / aggregation.
NUMERIC_FIELDS = (
    "mvUsd", "mvNok", "pe", "fwdPe", "pb", "divYield", "marketCap",
    "ownership", "beta", "price", "change", "targetPrice", "high52", "low52",
)
# Fields returned per holding in query results (kept compact to bound tokens).
RETURN_FIELDS = (
    "name", "country", "sector", "industry", "mvUsd", "ownership",
    "pe", "fwdPe", "pb", "divYield", "marketCap", "rec", "price",
)
GROUP_FIELDS = ("country", "sector", "industry")
# Large money values are rounded to whole numbers; everything else to 3 decimals.
MONEY_FIELDS = {"mvUsd", "mvNok", "marketCap", "targetPrice", "high52", "low52", "price"}


def _num(v):
    """Coerce to a FINITE float, else None. Rejects '', None, and 'Infinity'/nan."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _clean_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


# Rows carry fetchedAt as a naive local timestamp ("2026-06-22 21:19:53"). Take the
# LATEST date across rows as the snapshot date, comparing the date portion as a plain
# string — no parsing, so no timezone can roll it onto the neighbouring day. This is the
# same rule frontend/scripts/build-static.mjs uses, so the static pages and the assistant
# always cite one date.
# The file's mtime is NOT a usable source: it moves whenever the file is copied, deployed
# or rewritten, which had the assistant citing 2026-08-02 for a 2026-06-22 snapshot.
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _snapshot_date(rows):
    """Latest valid fetchedAt date across rows, or None if none is usable."""
    best = None
    for r in rows:
        v = r.get("fetchedAt")
        d = v[:10] if isinstance(v, str) else None
        if d and _DATE_RE.match(d) and (best is None or d > best):
            best = d
    return best


def _load():
    path = Path(config.DATA_PATH)
    try:
        raw = json.loads(path.read_text())
    except (OSError, ValueError) as e:
        log.warning("Holdings data not loaded from %s: %s", path, e)
        return [], None
    rows = []
    for r in raw:
        row = dict(r)
        for f in NUMERIC_FIELDS:
            row[f] = _num(r.get(f))
        for f in (*GROUP_FIELDS, "name", "ticker"):
            row[f] = _clean_str(r.get(f))
        rows.append(row)
    as_of = _snapshot_date(rows)
    if as_of is None:
        # Better to say "an unspecified date" than to cite a confidently wrong one.
        log.warning("No usable fetchedAt in %s — the assistant will not cite a date", path)
    log.info("Loaded %d holdings from %s (as of %s)", len(rows), path, as_of)
    return rows, as_of


_ROWS, AS_OF = _load()
SECTORS = sorted({r["sector"] for r in _ROWS if r["sector"]})
COUNTRIES = sorted({r["country"] for r in _ROWS if r["country"]})
META = {"count": len(_ROWS), "as_of": AS_OF, "sectors": SECTORS, "countries": COUNTRIES}


def _round(field, v):
    if v is None:
        return None
    return round(v) if field in MONEY_FIELDS else round(v, 3)


def _match(row, field, value):
    """Case-insensitive: value equals, or is contained in, the row's field."""
    if value is None:
        return True
    rv = row.get(field)
    if not rv:
        return False
    rv, value = rv.lower(), str(value).strip().lower()
    return value == rv or value in rv


def _clamp_limit(limit, default=5, hi=20):
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        return default
    return max(1, min(limit, hi))


def query_holdings(country=None, sector=None, industry=None, name_contains=None,
                   sort_by=None, order="desc", limit=5):
    """Filter individual holdings, optionally sort by a numeric field, return top N."""
    rows = [r for r in _ROWS
            if _match(r, "country", country)
            and _match(r, "sector", sector)
            and _match(r, "industry", industry)
            and _match(r, "name", name_contains)]

    if sort_by in NUMERIC_FIELDS:
        desc = (order or "desc").lower() != "asc"
        # None values always sort last, regardless of direction.
        rows = sorted(
            rows,
            key=lambda r: (r.get(sort_by) is None,
                           -(r.get(sort_by) or 0.0) if desc else (r.get(sort_by) or 0.0)),
        )

    limit = _clamp_limit(limit)
    results = [
        {f: (_round(f, r.get(f)) if f in NUMERIC_FIELDS else r.get(f)) for f in RETURN_FIELDS}
        for r in rows[:limit]
    ]
    return {"matched": len(rows), "returned": len(results), "results": results}


def aggregate(group_by, metric, agg, filter_country=None, filter_sector=None,
              filter_industry=None, order="desc", limit=5):
    """Group holdings and compute one statistic per group (avg/sum/min/max/count)."""
    agg = (agg or "").lower()
    if group_by not in GROUP_FIELDS:
        return {"error": f"group_by must be one of {list(GROUP_FIELDS)}"}
    if agg not in ("avg", "sum", "min", "max", "count"):
        return {"error": "agg must be one of avg, sum, min, max, count"}
    if agg != "count" and metric not in NUMERIC_FIELDS:
        return {"error": f"metric must be one of {list(NUMERIC_FIELDS)}"}

    rows = [r for r in _ROWS
            if _match(r, "country", filter_country)
            and _match(r, "sector", filter_sector)
            and _match(r, "industry", filter_industry)]

    groups: dict[str, list] = {}
    for r in rows:
        g = r.get(group_by)
        if g:  # skip rows with no group label
            groups.setdefault(g, []).append(r)

    results = []
    for g, grp in groups.items():
        if agg == "count":
            value, n = len(grp), len(grp)
        else:
            vals = [r[metric] for r in grp if r.get(metric) is not None]
            if not vals:
                continue
            n = len(vals)
            value = {"avg": sum(vals) / n, "sum": sum(vals),
                     "min": min(vals), "max": max(vals)}[agg]
        results.append({"group": g, "value": _round(metric, value) if agg != "count" else value, "n": n})

    desc = (order or "desc").lower() != "asc"
    results.sort(key=lambda x: x["value"], reverse=desc)
    return {"groups": len(results), "results": results[:_clamp_limit(limit)]}


def run_tool(name, args):
    """Dispatch a model tool call to the matching query function. Always returns a
    JSON-serializable dict (never raises) so the model can be told about failures."""
    args = args or {}
    try:
        if name == "query_holdings":
            return query_holdings(
                country=args.get("country"), sector=args.get("sector"),
                industry=args.get("industry"), name_contains=args.get("name_contains"),
                sort_by=args.get("sort_by"), order=args.get("order", "desc"),
                limit=args.get("limit", 5))
        if name == "aggregate":
            return aggregate(
                group_by=args.get("group_by"), metric=args.get("metric"),
                agg=args.get("agg"), filter_country=args.get("filter_country"),
                filter_sector=args.get("filter_sector"),
                filter_industry=args.get("filter_industry"),
                order=args.get("order", "desc"), limit=args.get("limit", 5))
        return {"error": f"unknown tool '{name}'"}
    except Exception:
        log.exception("tool %s failed", name)
        return {"error": "tool execution failed"}
