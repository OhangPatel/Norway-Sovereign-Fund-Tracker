#  Fetch a small logo for every ticker into frontend/public/logos/
"""Runs when new tickers appear, i.e. after a new period is added. Incremental.

Every ticker across every period gets one file, logos/{ticker}.webp, 64x64. That is
~3 KB each and ~5 MB for all ~2,000 companies; the browser lazy-loads only the rows on
screen, so a visitor downloads a few dozen of them, not the set.

HOW
    Yahoo's info["website"]  ->  domain  ->  Google's favicon service at 64px
    ->  re-encoded as WebP.

Google answers 404 when it has no icon, and for some sites only has a 16px favicon.
Both are skipped: a 16px icon blown up to row size looks broken, and the frontend
already draws the company's initial when no logo file exists.

Self-hosted rather than hot-linked so the live site depends on no third party, and the
CSP's img-src can stay 'self'.

Existing files are never re-fetched. Delete one to force a refresh of that logo.
"""
import io
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
import yfinance as yf
from PIL import Image

from fetch_yahoo_metrics import collect_tickers

SCRIPT_DIR = Path(__file__).resolve().parent
LOGO_DIR = SCRIPT_DIR.parent.parent / "frontend" / "public" / "logos"
FAVICON_URL = "https://www.google.com/s2/favicons?domain={domain}&sz=64"
SIZE = 64
MIN_SOURCE_SIZE = 32


def domains_of(website):
    """The host as Yahoo gives it, then with "www." toggled. Google indexes some sites
    under only one of the two: allstate.com is a 404, www.allstate.com a 64px icon."""
    host = urlparse(website if "://" in website else f"https://{website}").hostname or ""
    bare = host.removeprefix("www.")
    return [host, bare] if host != bare else [host, f"www.{host}"]


def fetch_logo(ticker):
    """Returns why it failed, or None on success."""
    website = yf.Ticker(ticker).info.get("website")
    if not website:
        return "no website on Yahoo"
    for domain in domains_of(website):
        resp = requests.get(FAVICON_URL.format(domain=domain), timeout=15)
        if resp.status_code != 200:
            reason = f"no icon for {domain} (HTTP {resp.status_code})"
            continue
        img = Image.open(io.BytesIO(resp.content))
        if min(img.size) < MIN_SOURCE_SIZE:
            reason = f"icon for {domain} is only {img.size[0]}px"
            continue
        break
    else:
        return reason
    img = img.convert("RGBA").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    img.save(LOGO_DIR / f"{ticker}.webp", "WEBP", quality=85, method=6)
    return None


def main():
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    todo = [t for t in collect_tickers() if not (LOGO_DIR / f"{t}.webp").exists()]
    print(f"{len(todo)} ticker(s) without a logo.", flush=True)

    missed = []
    for i, ticker in enumerate(todo, 1):
        try:
            reason = fetch_logo(ticker)
        except Exception as e:
            reason = f"error: {e}"
        if reason:
            missed.append((ticker, reason))
        print(f"[{i}/{len(todo)}] {ticker}: {reason or 'saved'}", flush=True)
        time.sleep(0.3)

    print(f"Done. {len(todo) - len(missed)} saved, {len(missed)} without a logo "
          f"(the site shows their initial instead).", flush=True)
    for ticker, reason in missed:
        print(f"  - {ticker}: {reason}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
