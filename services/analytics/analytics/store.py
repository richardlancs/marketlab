"""
The price store and stored results, from the analytics service's side.

MarketLab's Next.js server writes each source's daily bars into daily_bar
(with a checksum per series in price_series). The analytics read them here,
and write what they calculate into analytics_result, which pages read.

Every result records:
- the checksum of the prices it used (a SHA-256 of the series' own
  checksums), so a later run can tell nothing has changed and skip it;
- ANALYTICS_VERSION, so a new version of a calculation replaces old results;
- the last close it includes.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd

from .db import Database

#: Bumped whenever a stored calculation changes, so every result is recalculated once.
ANALYTICS_VERSION = "1.0.0"
#: The index every beta and relative measure is taken against.
MARKET = "SPX"
SOURCES = ("mock", "tiingo")


@dataclass(frozen=True)
class SeriesInfo:
    checksum: str
    last_time: int
    bars: int


def series_index(db: Database, source: str, symbols: Iterable[str] | None = None) -> dict[str, SeriesInfo]:
    """Each stored series' checksum and last day."""
    rows = db.query("SELECT symbol, checksum, last_time, bars FROM price_series WHERE source = ?", [source])
    wanted = None if symbols is None else set(symbols)
    return {r["symbol"]: SeriesInfo(r["checksum"], int(r["last_time"]), int(r["bars"])) for r in rows if wanted is None or r["symbol"] in wanted}


def input_checksum(infos: Mapping[str, SeriesInfo]) -> str:
    """One checksum for a set of series: the same prices always give the same value."""
    text = "\n".join(f"{symbol}:{infos[symbol].checksum}" for symbol in sorted(infos))
    return hashlib.sha256(text.encode()).hexdigest()


def load_bars(db: Database, source: str, symbols: Sequence[str], since: int | None = None) -> dict[str, pd.DataFrame]:
    """
    Stored bars for these symbols, oldest first, indexed by close time (ms),
    with columns open, high, low, close, adj_close, volume (floats). A symbol
    with nothing stored is left out. With `since` (ms), only bars from then
    on: less to send from the database when the rest isn't needed.
    """
    if not symbols:
        return {}
    marks = ",".join("?" for _ in symbols)
    window = " AND time >= ?" if since is not None else ""
    rows = db.query(
        f"SELECT symbol, time, open, high, low, close, adj_close, volume FROM daily_bar WHERE source = ? AND symbol IN ({marks}){window} ORDER BY symbol, time",
        [source, *symbols, *([since] if since is not None else [])],
    )
    if not rows:
        return {}
    frame = pd.DataFrame(rows)
    out: dict[str, pd.DataFrame] = {}
    for symbol, group in frame.groupby("symbol", sort=False):
        table = group.drop(columns="symbol").set_index("time").astype(np.float64)
        table.index = table.index.astype(np.int64)
        out[str(symbol)] = table
    return out


def load_closes(db: Database, source: str, symbols: Sequence[str], since: int, until: int) -> dict[str, pd.Series]:
    """Stored adjusted closes for these symbols from `since` to `until` (ms, inclusive), oldest first; a symbol with none is left out."""
    if not symbols:
        return {}
    marks = ",".join("?" for _ in symbols)
    rows = db.query(
        f"SELECT symbol, time, adj_close FROM daily_bar WHERE source = ? AND symbol IN ({marks}) AND time >= ? AND time <= ? ORDER BY symbol, time",
        [source, *symbols, since, until],
    )
    out: dict[str, pd.Series] = {}
    if not rows:
        return out
    frame = pd.DataFrame(rows)
    for symbol, group in frame.groupby("symbol", sort=False):
        out[str(symbol)] = pd.Series(group["adj_close"].to_numpy(dtype=np.float64), index=pd.Index(group["time"].to_numpy(dtype=np.int64)), name=str(symbol))
    return out


def stored_versions(db: Database, kind: str, source: str) -> dict[str, tuple[str, str]]:
    """(version, input checksum) of each stored result of this kind."""
    rows = db.query("SELECT subject, version, input_checksum FROM analytics_result WHERE kind = ? AND source = ?", [kind, source])
    return {r["subject"]: (r["version"], r["input_checksum"]) for r in rows}


def save_results(db: Database, kind: str, source: str, results: Sequence[tuple[str, str, int, Any]]) -> None:
    """Stores (subject, input checksum, as-of, result) rows of one kind, replacing older ones, in one transaction."""
    if not results:
        return
    now = int(time.time() * 1000)
    sql = (
        "INSERT INTO analytics_result (kind, subject, source, version, input_checksum, as_of, result, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT (kind, subject, source) DO UPDATE SET version = excluded.version, input_checksum = excluded.input_checksum, "
        "as_of = excluded.as_of, result = excluded.result, computed_at = excluded.computed_at"
    )
    db.execute_many([(sql, [kind, subject, source, ANALYTICS_VERSION, checksum, as_of, json.dumps(result, allow_nan=False), now]) for subject, checksum, as_of, result in results])
