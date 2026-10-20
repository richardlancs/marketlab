"""
Data preparation and validation: turning raw daily prices into trading
sessions the simulation can use.

A *session* is a day with a recorded close. Nothing assumes every calendar
day has one: weekends, holidays and any missing day simply aren't sessions,
and "the previous session" means the previous day with a price, not the
previous calendar day.

Nothing here fills in a missing price, from the past or the future. A day one
series lacks is left out for every series (see `align`), so no value is ever
invented.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

import numpy as np
import pandas as pd

#: The most daily prices a series may have (about 15 years); keeps a request bounded.
MAX_POINTS = 4000


class InputError(ValueError):
    """Inputs the engine refuses, with a message fit to show a user."""


def to_series(symbol: str, times: Sequence[int], prices: Sequence[float]) -> pd.Series:
    """
    A validated daily series, indexed by timestamp (ms). Refuses what the
    simulation can't use: mismatched lengths, too many points, duplicate or
    unsorted dates, and prices that are missing, not finite or not positive.
    """
    if len(times) != len(prices):
        raise InputError(f"{symbol}: there are {len(times)} dates but {len(prices)} prices.")
    if len(times) == 0:
        raise InputError(f"{symbol}: there are no prices.")
    if len(times) > MAX_POINTS:
        raise InputError(f"{symbol}: at most {MAX_POINTS} daily prices are allowed.")
    index = pd.Index(np.asarray(times, dtype=np.int64))
    if index.has_duplicates:
        duplicate = int(index[index.duplicated()][0])
        raise InputError(f"{symbol}: the date {pd.Timestamp(duplicate, unit='ms').date()} appears more than once.")
    if not index.is_monotonic_increasing:
        raise InputError(f"{symbol}: dates must be in order, oldest first.")
    if any(p is None for p in prices):
        raise InputError(f"{symbol}: a price is missing. Leave the day out instead; prices are never filled in.")
    values = np.asarray(prices, dtype=np.float64)
    if not np.all(np.isfinite(values)) or np.any(values <= 0):
        raise InputError(f"{symbol}: every price must be a positive, finite number.")
    return pd.Series(values, index=index, name=symbol)


@dataclass(frozen=True)
class Sessions:
    """
    The trading sessions every series has, oldest first, with each symbol's
    close on each one. `first_measured` is the index of the first session in
    the measurement period; any sessions before it are earlier history, kept
    only so indicators can warm up on it (see engine.Warmup).
    """

    times: tuple[int, ...]
    closes: Mapping[str, tuple[float, ...]]
    first_measured: int = 0

    def __len__(self) -> int:
        return len(self.times)


def align(series: Mapping[str, pd.Series], start: int, end: int, *, history_before: int = 0) -> Sessions:
    """
    The sessions every series has, from `start` to `end` (inclusive), in the
    first series' order. A session missing from any series is left out for
    all of them.

    With `history_before`, up to that many shared sessions before `start` are
    kept too, as earlier history for indicators (only as many as exist: none
    are invented). They're marked by `first_measured`.
    """
    symbols = list(series)
    days = series[symbols[0]].index
    for s in symbols[1:]:
        days = days[days.isin(series[s].index)]
    days = days[days <= end]
    measured = days[days >= start]
    earlier = days[days < start][-history_before:] if history_before > 0 else days[:0]
    kept = earlier.append(measured)
    # .tolist() gives Python floats, so the simulation is ordinary float arithmetic.
    closes = {s: tuple(series[s].loc[kept].tolist()) for s in symbols}
    return Sessions(times=tuple(int(t) for t in kept), closes=closes, first_measured=len(earlier))
