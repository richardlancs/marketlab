"""
Calculating stored results in batches, within a time budget.

The Next.js server's daily job calls these after it has refreshed the price
store, and pages call them for one symbol when a result is missing. Each
call does what fits in `budget_ms` and reports what's left, so a big batch
spreads over several calls instead of hitting a serverless time limit.

Results whose prices and analytics version haven't changed are skipped, so
running a job twice costs almost nothing.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Sequence

from . import profiles, store
from .db import Database

#: Symbols loaded and calculated per database round trip.
CHUNK = 8


@dataclass
class JobSummary:
    computed: list[str] = field(default_factory=list)
    unchanged: int = 0
    missing: list[str] = field(default_factory=list)
    failed: dict[str, str] = field(default_factory=dict)
    remaining: list[str] = field(default_factory=list)
    ms: int = 0


def run_stock_profiles(db: Database, source: str, symbols: Sequence[str] | None = None, budget_ms: int = 8000) -> JobSummary:
    """Recalculates the stock profiles (analytics/profiles.py) that are missing or stale."""
    start = time.monotonic()
    summary = JobSummary()
    index = store.series_index(db, source)
    wanted = list(dict.fromkeys(symbols)) if symbols is not None else sorted(index)
    summary.missing = [s for s in wanted if s not in index]
    market = index.get(store.MARKET)
    stored = store.stored_versions(db, "stock-profile", source)

    due: list[tuple[str, str]] = []
    for symbol in wanted:
        if symbol not in index:
            continue
        inputs = {symbol: index[symbol], **({store.MARKET: market} if market else {})}
        checksum = store.input_checksum(inputs)
        if stored.get(symbol) == (store.ANALYTICS_VERSION, checksum):
            summary.unchanged += 1
        else:
            due.append((symbol, checksum))

    market_bars = store.load_bars(db, source, [store.MARKET]).get(store.MARKET) if market else None
    slowest = 0.0  # the longest a chunk has taken so far (ms): don't start one that wouldn't finish in time
    for i in range(0, len(due), CHUNK):
        elapsed = (time.monotonic() - start) * 1000
        if elapsed + slowest > budget_ms:
            summary.remaining = [s for s, _ in due[i:]]
            break
        chunk_start = time.monotonic()
        chunk = due[i : i + CHUNK]
        bars = store.load_bars(db, source, [s for s, _ in chunk])
        rows = []
        for symbol, checksum in chunk:
            try:
                result = profiles.stock_profile(bars[symbol], market_bars)
                rows.append((symbol, checksum, result["asOf"], result))
            except (KeyError, ValueError) as error:
                summary.failed[symbol] = str(error) or "no prices"
        store.save_results(db, "stock-profile", source, rows)
        summary.computed += [r[0] for r in rows]
        slowest = max(slowest, (time.monotonic() - chunk_start) * 1000)
    summary.ms = int((time.monotonic() - start) * 1000)
    return summary


#: The nightly parts, in order: alerts first (the emails and pushes that follow send what they trigger),
#: option marks before the snapshots that value options at them, then the rest.
NIGHTLY_PARTS = ("alerts", "marks", "snapshots", "profiles", "factors")


def run_nightly(db: Database, source: str, universe: Sequence[str], budget_ms: int = 20_000, parts: Sequence[str] = NIGHTLY_PARTS) -> dict:
    """
    Every nightly calculation, in order, within one time budget: indicator
    alerts (alerts.py), option marks (option_marks.py), portfolio snapshots (snapshots.py), stock profiles
    (run_stock_profiles) and factors (factors.py). Each part is safe to run
    again and skips what hasn't changed, so a run that stops early is simply
    continued by the next one. Returns what each part did, or why it failed;
    `unfinished` lists the parts with work left.
    """
    from . import alerts, factors, option_marks, snapshots

    start = time.monotonic()
    left = lambda: budget_ms - (time.monotonic() - start) * 1000  # noqa: E731
    out: dict[str, object] = {}
    unfinished: list[str] = []
    for part in parts:
        if left() < 500:
            out[part] = "skipped: out of time"
            unfinished.append(part)
            continue
        try:
            if part == "alerts":
                result = alerts.evaluate(db, source, int(left()))
                if result["unfinished"]:
                    unfinished.append(part)
            elif part == "marks":
                result = option_marks.run(db, source, int(min(left(), 5000)))
                if result["remaining"]:
                    unfinished.append(part)
            elif part == "snapshots":
                result = snapshots.run(db, source, int(left()))
                if result.get("remaining"):
                    unfinished.append(part)
            elif part == "profiles":
                summary = run_stock_profiles(db, source, None, int(min(left(), 15_000)))
                result = {"computed": len(summary.computed), "unchanged": summary.unchanged, "failed": len(summary.failed), "remaining": len(summary.remaining)}
                if summary.remaining:
                    unfinished.append(part)
            elif part == "factors":
                result = factors.refresh(db, source, universe)
            else:
                result = "unknown part"
        except Exception as error:  # one part failing mustn't stop the others
            print(f"[analytics] nightly {part} failed: {error!r}")
            result = f"failed: {error}"
        out[part] = result
    return {"parts": out, "unfinished": unfinished, "ms": int((time.monotonic() - start) * 1000)}
