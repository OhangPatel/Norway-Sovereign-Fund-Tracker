"""Abuse / charge protection: rate limiting and input validation."""
import json
import os
import time
from collections import deque, defaultdict
from datetime import date
from pathlib import Path


class RateLimiter:
    """In-memory sliding-window per-IP minute limit + a persisted daily ceiling.

    The daily ceiling is the hard charge cap: the backend makes at most `per_day`
    upstream Gemini calls per calendar day regardless of who calls. The count is
    persisted to a small JSON file so a restart/redeploy can't silently reset your
    spend ceiling back to zero.

    Caveats (documented honestly): this is best-effort, not a hard guarantee.
      * It only holds within a SINGLE process. If you run multiple workers/instances
        the effective cap is multiplied — run one worker, or back this with Redis.
      * The per-IP minute window is in-memory and resets on restart (that's fine —
        it's only a 60-second burst guard).
    The real, unbypassable spend guarantee is a quota/budget cap on Google's side.
    """

    def __init__(self, per_minute: int, per_day: int, state_path: str | None = None):
        self.per_minute = per_minute
        self.per_day = per_day
        self._state_path = Path(state_path) if state_path else None
        self._minute: dict[str, deque] = defaultdict(deque)
        self._day = date.today()
        self._day_count = 0
        self._load()

    # ── Persistence of the daily counter ──────────────────────────────────────
    def _load(self):
        if not self._state_path or not self._state_path.exists():
            return
        try:
            data = json.loads(self._state_path.read_text())
            if data.get("day") == self._day.isoformat():
                self._day_count = int(data.get("count", 0))
        except (ValueError, OSError):
            pass  # Corrupt/unreadable state — start fresh; the cap still applies.

    def _save(self):
        if not self._state_path:
            return
        try:
            tmp = self._state_path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"day": self._day.isoformat(), "count": self._day_count}))
            os.replace(tmp, self._state_path)  # Atomic; never leaves a half-written file.
        except OSError:
            pass  # Read-only/ephemeral disk — degrade to in-memory rather than crash.

    def _roll_day(self):
        today = date.today()
        if today != self._day:
            self._day = today
            self._day_count = 0
            self._minute.clear()
            self._save()

    # ── The actual check ──────────────────────────────────────────────────────
    def check(self, ip: str):
        """Returns (allowed: bool, reason: str | None). Counts the call if allowed."""
        self._roll_day()
        if self._day_count >= self.per_day:
            return False, "daily"
        now = time.time()
        dq = self._minute[ip]
        while dq and now - dq[0] > 60:
            dq.popleft()
        if len(dq) >= self.per_minute:
            return False, "minute"
        dq.append(now)
        self._day_count += 1
        self._save()
        return True, None

    def remaining_today(self) -> int:
        self._roll_day()
        return max(0, self.per_day - self._day_count)

    def prune(self):
        """Drop per-IP windows that are fully expired so a flood of unique (possibly
        spoofed) IPs can't grow memory without bound. Cheap; called opportunistically."""
        now = time.time()
        for ip in list(self._minute.keys()):
            dq = self._minute[ip]
            while dq and now - dq[0] > 60:
                dq.popleft()
            if not dq:
                del self._minute[ip]


def validate_message(text, max_chars: int):
    """Returns an error string, or None if the message is acceptable."""
    if not isinstance(text, str):
        return "Message must be text."
    stripped = text.strip()
    if not stripped:
        return "Message is empty."
    if len(stripped) > max_chars:
        return f"Message too long (max {max_chars} characters)."
    return None
