"""
Indicator alerts, checked each night against the stored daily closes:

- RSI: RSI(days) closes above (or below) a level, having been on the other
  side the day before;
- average cross: the close crosses above (or below) its `days`-day average,
  which includes that close;
- big move: the close is up (or down) at least `percent`% on the previous one;
- 52-week range: the close is above every close of the previous 252 sessions
  (or below every one).

The same rules as the Next.js alert code that ran them before
(lib/alerts.ts), on closes adjusted for later splits only (not dividends),
so a split never looks like a crash. Price alerts ("closes above $70") stay
in the Next.js server, which checks them on every visit as well as nightly.

An untriggered alert is checked on every close since it was made; the first
close where its condition holds triggers it, at that day's close as traded.
"""

from __future__ import annotations

import json
import math
import time
from collections.abc import Mapping, Sequence
from typing import Any

import pandas as pd

from . import store
from .db import Database
from .strategies import _rsi_stream, _sma_stream

DAY_MS = 86_400_000
#: The longest look-back a condition needs (the 52-week range, and a 200-day average), with a margin.
HISTORY_SESSIONS = 260


def _series(cache: dict[str, list[float]], key: str, make) -> list[float]:
    if key not in cache:
        cache[key] = make()
    return cache[key]


def condition_met(condition: Mapping[str, Any], direction: str, closes: Sequence[float], i: int, cache: dict[str, list[float]]) -> bool:
    """Whether the condition holds at session `i` of `closes` (split-adjusted, oldest first)."""
    if i < 1:
        return False
    up = direction == "above"
    kind = condition["kind"]
    if kind == "rsi":
        days, level = condition["days"], condition["level"]
        stream_values = _series(cache, f"rsi:{days}", lambda: _run(_rsi_stream(days), closes))
        before, now = stream_values[i - 1], stream_values[i]
        return (before <= level and now > level) if up else (before >= level and now < level)
    if kind == "sma-cross":
        days = condition["days"]
        sma = _series(cache, f"sma:{days}", lambda: _run(_sma_stream(days), closes))
        return (closes[i - 1] <= sma[i - 1] and closes[i] > sma[i]) if up else (closes[i - 1] >= sma[i - 1] and closes[i] < sma[i])
    if kind == "move":
        change = closes[i] / closes[i - 1] - 1
        return change >= condition["percent"] / 100 if up else change <= -condition["percent"] / 100
    if kind == "range-52w":
        if i < 252:
            return False
        past = closes[i - 252 : i]
        return closes[i] > max(past) if up else closes[i] < min(past)
    return False


def _run(step, closes: Sequence[float]) -> list[float]:
    return [step(c) for c in closes]


def split_adjusted(bars: pd.DataFrame) -> list[float]:
    """
    Closes as traded, scaled for every later split (not dividends). The store
    keeps closes as traded and fully adjusted ones; a split shows as a jump
    in their ratio by the split's ratio (a dividend only nudges it).
    """
    close = bars["close"].to_numpy(dtype=float)
    ratio = close / bars["adj_close"].to_numpy(dtype=float)
    factor = [1.0] * len(close)
    later = 1.0
    for t in range(len(close) - 1, 0, -1):
        factor[t] = later
        jump = ratio[t - 1] / ratio[t]
        if jump >= 1.25:  # a split of 5-for-4 or more; dividends are far smaller
            later *= round(jump * 4) / 4
    factor[0] = later
    return [c / f for c, f in zip(close, factor)]


def evaluate(db: Database, source: str, budget_ms: int = 8000) -> dict[str, Any]:
    """Checks every untriggered indicator alert against the closes since it was made, and records the ones that trigger."""
    start = time.monotonic()
    rows = db.query("SELECT id, user_id, symbol, direction, condition, created_at FROM price_alert WHERE triggered_at IS NULL AND condition IS NOT NULL")
    by_symbol: dict[str, list[dict]] = {}
    for r in rows:
        by_symbol.setdefault(r["symbol"], []).append(r)
    triggered: list[tuple[int, float, str]] = []
    checked, unfinished = 0, 0
    for symbol, alerts in by_symbol.items():
        if (time.monotonic() - start) * 1000 > budget_ms:
            unfinished += len(alerts)
            continue
        earliest = min(int(a["created_at"]) for a in alerts)
        bars = store.load_bars(db, source, [symbol], earliest - int(HISTORY_SESSIONS * 1.6) * DAY_MS).get(symbol)
        if bars is None or bars.empty:
            continue
        closes = split_adjusted(bars)
        times = [int(t) for t in bars.index]
        raw = bars["close"].tolist()
        cache: dict[str, list[float]] = {}
        for a in alerts:
            checked += 1
            condition = json.loads(a["condition"]) if isinstance(a["condition"], str) else a["condition"]
            for i, t in enumerate(times):
                if t <= int(a["created_at"]):
                    continue
                if condition_met(condition, a["direction"], closes, i, cache):
                    triggered.append((t, float(raw[i]), a["id"]))
                    break
    if triggered:
        # Only if still untriggered: a visit may have changed it meanwhile.
        db.execute_many([("UPDATE price_alert SET triggered_at = ?, trigger_price = ? WHERE id = ? AND triggered_at IS NULL", list(row)) for row in triggered])
    return {"checked": checked, "triggered": len(triggered), "unfinished": unfinished}
