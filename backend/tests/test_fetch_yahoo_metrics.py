"""What the Yahoo fetch does when Yahoo stops answering.

    python -m unittest discover -s backend/tests

Yahoo is faked at yfinance's HTTP layer rather than by faking yfinance, because the
real Ticker's behaviour is part of what is under test: it marks itself as fetched
before its request goes out, so asking a failed one again returns None without trying.
"""
import contextlib
import io
import logging
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))

from curl_cffi.requests.exceptions import HTTPError
from yfinance.data import YfData
from yfinance.exceptions import YFRateLimitError

import fetch_yahoo_metrics as fetch
from setup_database import CREATE_TABLE_QUERY

TICKERS = [f"T{i:03d}" for i in range(200)]
REQUESTS_PER_TICKER = 3     # quoteSummary, v7/quote and the PEG timeseries, per .info


def rate_limit_error():
    return YFRateLimitError()


def unauthorized_error():
    # How Yahoo also throttles: yfinance swallows this one, then fails on what it left
    # itself with, so it reaches the caller as a TypeError and not as a rate limit.
    return HTTPError("401 Unauthorized", response=SimpleNamespace(text="Invalid Crumb"))


class FakeYahoo:
    """Refuses every request from the Nth until the client has waited `cooldown` seconds."""

    def __init__(self, throttle_at=None, cooldown=0, error=rate_limit_error, no_data=()):
        self.requests = 0
        self.throttle_at = throttle_at
        self.cooldown = cooldown
        self.error = error
        self.no_data = set(no_data)
        self.throttled = False
        self.waited = 0
        self.sleeps = []

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        if self.throttled:
            self.waited += seconds
            if self.waited >= self.cooldown:
                self.throttled = False
                self.throttle_at = None

    def _answer(self, symbol, key, row):
        self.requests += 1
        if self.requests == self.throttle_at:
            self.throttled = True
        if self.throttled:
            raise self.error()
        return {key: {"result": [] if symbol in self.no_data else [row], "error": None}}

    def get_raw_json(self, url, params=None, timeout=30):
        if "quoteSummary" in url:
            return self._answer(params["symbol"], "quoteSummary", {"summaryDetail": {"beta": 1.1}})
        return self._answer(params["symbols"], "quoteResponse", {"regularMarketPrice": 1.0})

    def cache_get(self, url, params=None, timeout=30):
        self.requests += 1
        return SimpleNamespace(text='{"timeseries": {"result": [{}], "error": null}}')


def run_fetch(yahoo):
    """Run the real fetch over TICKERS. Returns (tickers saved, what it printed)."""
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "test.db"
        conn = sqlite3.connect(db)
        conn.execute(CREATE_TABLE_QUERY.format(name="financial_metrics"))
        conn.commit()
        conn.close()

        out = io.StringIO()
        with mock.patch.object(fetch, "DB_PATH", db), \
             mock.patch.object(fetch, "collect_tickers", lambda: list(TICKERS)), \
             mock.patch.object(fetch.time, "sleep", yahoo.sleep), \
             mock.patch.object(YfData, "get_raw_json", yahoo.get_raw_json), \
             mock.patch.object(YfData, "cache_get", yahoo.cache_get), \
             contextlib.redirect_stdout(out):
            fetch.fetch_financial_metrics()

        conn = sqlite3.connect(db)
        saved = {row[0] for row in conn.execute("SELECT ticker FROM financial_metrics")}
        conn.close()
    return saved, out.getvalue()


class FetchUnderThrottling(unittest.TestCase):
    def setUp(self):
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)

    def test_a_clean_run_saves_everything_at_the_minimum_pace(self):
        yahoo = FakeYahoo()
        saved, _ = run_fetch(yahoo)
        self.assertEqual(saved, set(TICKERS))
        self.assertEqual(len(yahoo.sleeps), len(TICKERS) // fetch.BATCH_SIZE)
        self.assertTrue(all(s > fetch.MIN_BATCH_SECONDS - 1 for s in yahoo.sleeps), yahoo.sleeps)

    def test_a_rate_limit_is_waited_out_and_loses_nothing(self):
        # Published runs #3 and #6: refused partway, then everything after it was lost.
        yahoo = FakeYahoo(throttle_at=60 * REQUESTS_PER_TICKER + 1, cooldown=30)
        saved, _ = run_fetch(yahoo)
        self.assertEqual(saved, set(TICKERS))
        self.assertIn(fetch.RATE_LIMIT_WAITS[0], yahoo.sleeps)

    def test_throttling_that_is_not_a_rate_limit_error_gets_a_second_pass(self):
        yahoo = FakeYahoo(throttle_at=60 * REQUESTS_PER_TICKER + 1, cooldown=120,
                          error=unauthorized_error)
        saved, _ = run_fetch(yahoo)
        self.assertEqual(saved, set(TICKERS))
        self.assertIn(fetch.RETRY_PASS_WAIT, yahoo.sleeps)

    def test_a_block_that_outlasts_every_wait_stops_and_keeps_what_it_has(self):
        yahoo = FakeYahoo(throttle_at=60 * REQUESTS_PER_TICKER + 1, cooldown=float("inf"))
        saved, printed = run_fetch(yahoo)
        self.assertEqual(saved, set(TICKERS[:60]))
        waits = [s for s in yahoo.sleeps if s in fetch.RATE_LIMIT_WAITS]
        self.assertEqual(tuple(waits), fetch.RATE_LIMIT_WAITS)
        self.assertNotIn("Done!", printed)

    def test_a_ticker_yahoo_has_no_data_for_is_not_a_failure(self):
        yahoo = FakeYahoo(no_data={"T005"})
        saved, printed = run_fetch(yahoo)
        self.assertEqual(saved, set(TICKERS) - {"T005"})
        self.assertNotIn(fetch.RETRY_PASS_WAIT, yahoo.sleeps)
        self.assertIn("Done!", printed)


if __name__ == "__main__":
    unittest.main()
