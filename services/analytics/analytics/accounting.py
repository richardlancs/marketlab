"""
Cash and position accounting: what the portfolio holds, what it's worth, and
a record of every session.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass
class Portfolio:
    """Cash and fractional shares. Changed only by execution.py."""

    cash: float
    shares: dict[str, float]

    @classmethod
    def starting(cls, cash: float, symbols) -> "Portfolio":
        return cls(cash=float(cash), shares={s: 0.0 for s in symbols})

    def holdings_value(self, prices: Mapping[str, float]) -> float:
        """The positions at `prices`, summed left to right in the portfolio's own symbol order (as the TypeScript engine does)."""
        total = 0.0
        for s in self.shares:
            total = total + self.shares[s] * prices[s]
        return total


@dataclass(frozen=True)
class DayRecord:
    """One session's books, after its orders filled, valued at its close."""

    time: int
    cash: float
    shares: Mapping[str, float]
    holdings_value: float
    total_value: float
    decided: bool
    """Whether the strategy asked for a change this session (which may or may not have traded)."""
