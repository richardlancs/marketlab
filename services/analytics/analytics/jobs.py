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
CHUNK = 12


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
    for i in range(0, len(due), CHUNK):
        if (time.monotonic() - start) * 1000 > budget_ms:
            summary.remaining = [s for s, _ in due[i:]]
            break
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
    summary.ms = int((time.monotonic() - start) * 1000)
    return summary
