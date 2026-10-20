"""
Indicators, computed over a whole table of sessions but using only trailing
observations, and *shifted once* so a value can be used on the day it's
listed under:

    sma_through_previous(closes, n)[D] = mean of closes[D-n], ..., closes[D-1]

That's the average a strategy could know before session D's close: it ends
at session D-1. Strategies read the value at D as it is; nothing shifts it
again (shifting twice would delay every signal by a further session).

A value is None until there are n earlier sessions: no average is made from
fewer observations, and no missing one is filled in.

Sums run left to right, one number at a time, exactly as the TypeScript
engine's reduce does (Python's sum() and NumPy use more accurate summation,
which can differ in the last digit, and a crossover can turn that into a
trade on another day).
"""

from __future__ import annotations

from typing import Sequence


def sma_through_previous(closes: Sequence[float], window: int) -> list[float | None]:
    if window < 1:
        raise ValueError("A moving average needs a window of at least 1 session.")
    values: list[float | None] = [None] * len(closes)
    for day in range(window, len(closes)):
        total = 0.0
        for i in range(day - window, day):  # sessions D-window .. D-1: never D itself
            total = total + closes[i]
        values[day] = total / window
    return values
