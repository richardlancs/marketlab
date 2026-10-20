"""
Strategy decisions: what to hold, decided before a session's prices exist.

On session D a strategy gets a DecisionContext with:
- `history`: closes through session D-1 only. It's a view that refuses any
  index at or after D, so even a careless strategy can't read the future;
- `indicator(name, symbol)`: precomputed indicator values for D, which
  already end at D-1 (see indicators.py; they're not shifted again here);
- the portfolio's shares and cash before D's orders.

It never receives session D's price: that's used only to execute the
orders it asks for and to value the portfolio afterwards (execution.py,
accounting.py).

A strategy returns a target (each symbol's share of total value, the rest in
cash) or None for "no change". Returning None when nothing would change is
what keeps it from trading every day.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Protocol, Sequence

from .data import InputError, Sessions
from .indicators import sma_through_previous

#: Each symbol's share of total value; whatever isn't allocated is held in cash.
Target = dict[str, float]


class LookAheadError(IndexError):
    """A strategy tried to read a price from the session it's deciding (or later)."""


class History:
    """
    Read-only closes for sessions 0 .. D-1 (completed sessions only).
    Indexing at or beyond D, or slicing past it, raises LookAheadError.
    """

    def __init__(self, sessions: Sessions, day: int):
        self._sessions = sessions
        self._day = day

    def __len__(self) -> int:
        return self._day

    @property
    def times(self) -> tuple[int, ...]:
        return self._sessions.times[: self._day]

    def closes(self, symbol: str) -> tuple[float, ...]:
        """Every completed close, oldest first."""
        return self._sessions.closes[symbol][: self._day]

    def close(self, symbol: str, index: int) -> float:
        """The close of session `index` (negative counts back from yesterday: -1 is yesterday's)."""
        position = index if index >= 0 else self._day + index
        if position >= self._day:
            raise LookAheadError(f"Session {position} isn't complete when deciding session {self._day}.")
        if position < 0:
            raise IndexError(f"There's no session {position}.")
        return self._sessions.closes[symbol][position]

    def last(self, symbol: str, count: int) -> tuple[float, ...]:
        """The last `count` completed closes (fewer if there aren't that many)."""
        return self._sessions.closes[symbol][max(0, self._day - count) : self._day]


@dataclass(frozen=True)
class DecisionContext:
    day: int
    """The session being decided, counted from the start of the measurement period."""
    time: int
    """Its date (known in advance; its prices aren't)."""
    first_measured_day: bool
    history: History
    shares: Mapping[str, float]
    cash: float
    indicators: Mapping[tuple[str, str], float | None] = field(default_factory=dict)

    def indicator(self, name: str, symbol: str) -> float | None:
        return self.indicators.get((name, symbol))


class Strategy(Protocol):
    name: str

    def indicators(self, sessions: Sessions) -> Mapping[tuple[str, str], Sequence[float | None]]:
        """Indicator series over all sessions, each value ending at the session before it (see indicators.py)."""
        ...

    def decide(self, ctx: DecisionContext) -> Target | None: ...


@dataclass
class BuyAndHold:
    """Invest at the target weights on the first measured session, then never trade."""

    weights: Mapping[str, float]
    name: str = "buy-and-hold"

    def indicators(self, sessions: Sessions) -> Mapping[tuple[str, str], Sequence[float | None]]:
        return {}

    def decide(self, ctx: DecisionContext) -> Target | None:
        return dict(self.weights) if ctx.first_measured_day else None


@dataclass
class MovingAverageCrossover:
    """
    Per stock: hold it (at its weight) while its `fast`-session average is
    above its `slow`-session average, both ending at the previous session;
    otherwise hold its share in cash.

    - Equal averages are not "above": the stock is held in cash.
    - It decides nothing until the slow average exists (`slow` earlier
      sessions); until then the money stays in cash.
    - It only asks to trade when some stock's wanted position (held or not)
      differs from the current one, so it doesn't trade every day.
    """

    weights: Mapping[str, float]
    fast: int = 50
    slow: int = 200
    name: str = "moving-average"

    def __post_init__(self):
        if not (isinstance(self.fast, int) and isinstance(self.slow, int) and 2 <= self.fast < self.slow):
            raise InputError("The short average must be at least 2 sessions and shorter than the long one.")

    def indicators(self, sessions: Sessions) -> Mapping[tuple[str, str], Sequence[float | None]]:
        series: dict[tuple[str, str], Sequence[float | None]] = {}
        for symbol in self.weights:
            series[("fast", symbol)] = sma_through_previous(sessions.closes[symbol], self.fast)
            series[("slow", symbol)] = sma_through_previous(sessions.closes[symbol], self.slow)
        return series

    def decide(self, ctx: DecisionContext) -> Target | None:
        if any(ctx.indicator("slow", s) is None for s in self.weights):
            return None  # still warming up
        target: Target = {}
        changed = False
        for s, weight in self.weights.items():
            uptrend = ctx.indicator("fast", s) > ctx.indicator("slow", s)  # strictly above: a tie means cash
            target[s] = weight if uptrend else 0.0
            if uptrend != (ctx.shares[s] > 0):
                changed = True
        return target if changed else None
