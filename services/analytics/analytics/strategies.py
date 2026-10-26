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

import json
import math
from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol, Sequence

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


# ---------------------------------------------------------------------------
# Calendar strategies: dollar-cost averaging and rebalancing
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Buy:
    """Spend these dollar amounts (at today's close), instead of moving to target weights."""

    amounts: Mapping[str, float]


def _month(ms: int) -> tuple[int, int]:
    from datetime import datetime, timezone

    d = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return d.year, d.month


def measured_times(ctx: DecisionContext) -> tuple[int, ...]:
    """The measured sessions' dates through the one being decided (dates are known in advance; prices aren't)."""
    return (*ctx.history.times[len(ctx.history) - ctx.day :], ctx.time)


def starts_month(ctx: DecisionContext) -> bool:
    """Whether the session being decided is the first of a new calendar month (never the first measured session)."""
    times = measured_times(ctx)
    return ctx.day > 0 and _month(times[-1]) != _month(times[-2])


def months_started(ctx: DecisionContext) -> int:
    """How many new months have started from the second measured session through this one."""
    times = measured_times(ctx)
    return sum(1 for a, b in zip(times, times[1:]) if _month(a) != _month(b))


@dataclass
class DollarCostAveraging:
    """Spread the starting cash over `installments` equal purchases: one on the first day, then one at the start of each month."""

    weights: Mapping[str, float]
    installments: int
    name: str = "dollar-cost-averaging"

    def indicators(self, sessions: Sessions) -> Mapping[tuple[str, str], Sequence[float | None]]:
        return {}

    def decide(self, ctx: DecisionContext) -> Buy | None:
        if ctx.day != 0 and not starts_month(ctx):
            return None
        done = 0 if ctx.day == 0 else months_started(ctx)
        if done >= self.installments:
            return None
        amount = ctx.cash / (self.installments - done)  # an equal share of what's left
        return Buy({s: amount * w for s, w in self.weights.items()})


@dataclass
class Rebalancing:
    """Invest at the weights, then reset to them at the start of every month or quarter."""

    weights: Mapping[str, float]
    frequency: str
    name: str = "rebalancing"

    def indicators(self, sessions: Sessions) -> Mapping[tuple[str, str], Sequence[float | None]]:
        return {}

    def decide(self, ctx: DecisionContext) -> Target | None:
        if ctx.day == 0:
            return dict(self.weights)
        every = 1 if self.frequency == "monthly" else 3
        if not starts_month(ctx) or months_started(ctx) % every != 0:
            return None
        return dict(self.weights)


# ---------------------------------------------------------------------------
# Custom rules (lib/backtest/rules.ts)
# ---------------------------------------------------------------------------

NAN = float("nan")


def _sma_stream(days: int):
    window: list[float] = []
    total = 0.0

    def step(close: float) -> float:
        nonlocal total
        window.append(close)
        total += close
        if len(window) > days:
            total -= window.pop(0)
        return total / days if len(window) == days else NAN

    return step


def _ema_stream(days: int):
    alpha = 2 / (days + 1)
    start = _sma_stream(days)
    ema = NAN

    def step(close: float) -> float:
        nonlocal ema
        if math.isnan(ema):
            ema = start(close)
            return ema
        ema = alpha * close + (1 - alpha) * ema
        return ema

    return step


def _rsi_stream(days: int):
    previous = NAN
    count = 0
    gain = 0.0
    loss = 0.0

    def step(close: float) -> float:
        nonlocal previous, count, gain, loss
        if not math.isnan(previous):
            change = close - previous
            up = max(change, 0.0)
            down = max(-change, 0.0)
            count += 1
            if count <= days:
                gain += up / days
                loss += down / days
            else:
                gain = (gain * (days - 1) + up) / days
                loss = (loss * (days - 1) + down) / days
        previous = close
        if count < days:
            return NAN
        if loss == 0:
            return 50.0 if gain == 0 else 100.0
        return 100 - 100 / (1 + gain / loss)

    return step


def _macd_stream():
    fast = _ema_stream(12)
    slow = _ema_stream(26)

    def step(close: float) -> float:
        a = fast(close)
        b = slow(close)
        return a - b

    return step


def _macd_signal_stream():
    line = _macd_stream()
    signal = _ema_stream(9)

    def step(close: float) -> float:
        value = line(close)
        return NAN if math.isnan(value) else signal(value)

    return step


def _bollinger_stream(days: int, side: int):
    window: list[float] = []

    def step(close: float) -> float:
        window.append(close)
        if len(window) > days:
            window.pop(0)
        if len(window) < days:
            return NAN
        total = 0.0
        for x in window:
            total = total + x
        mean = total / days
        squares = 0.0
        for x in window:
            squares = squares + (x - mean) ** 2
        return mean + side * 2 * math.sqrt(squares / days)

    return step


def _chandelier_stream(days: int, multiple: float):
    highs: list[float] = []
    previous_close = NAN
    count = 0
    atr = 0.0

    def step(bar) -> float:
        nonlocal previous_close, count, atr
        high, low, close = bar["high"], bar["low"], bar["close"]
        rng = high - low if math.isnan(previous_close) else max(high - low, abs(high - previous_close), abs(low - previous_close))
        previous_close = close
        count += 1
        atr = atr + rng / days if count <= days else (atr * (days - 1) + rng) / days
        highs.append(high)
        if len(highs) > days:
            highs.pop(0)
        if count < days:
            return NAN
        top = highs[0]
        for h in highs:
            if h > top:
                top = h
        return top - multiple * atr

    return step


def indicator_series_from_bars(indicator: Mapping[str, Any], bars: Sequence[Mapping[str, float]]) -> list[float]:
    """The indicator's value after each bar (close, high, low, volume), exactly as rules.ts computes it."""
    kind = indicator["kind"]
    if kind == "chandelier":
        step = _chandelier_stream(int(indicator["days"]), float(indicator["multiple"]))
        return [step(b) for b in bars]
    if kind == "volume":
        return [float(b["volume"]) for b in bars]
    if kind == "volume-average":
        average = _sma_stream(int(indicator["days"]))
        return [average(float(b["volume"])) for b in bars]
    return indicator_series(indicator, [b["close"] for b in bars])


def indicator_series(indicator: Mapping[str, Any], closes: Sequence[float]) -> list[float]:
    """The indicator's value after each close (NaN while it's warming up), exactly as rules.ts computes it."""
    kind = indicator["kind"]
    if kind == "price":
        return [float(c) for c in closes]
    if kind == "value":
        return [float(indicator["value"])] * len(closes)
    if kind == "macd":
        step = _macd_stream()
    elif kind == "macd-signal":
        step = _macd_signal_stream()
    elif kind in ("bollinger-upper", "bollinger-lower"):
        step = _bollinger_stream(int(indicator["days"]), 1 if kind == "bollinger-upper" else -1)
    else:
        step = {"sma": _sma_stream, "ema": _ema_stream, "rsi": _rsi_stream}[kind](int(indicator["days"]))
    return [step(c) for c in closes]


def _key(indicator: Mapping[str, Any]) -> str:
    return json.dumps(indicator, sort_keys=True)


@dataclass
class Rules:
    """
    Per stock: while out of it, buy it (at its weight) when the entry rules hold;
    while in it, sell when the exit rules hold. Conditions compare indicators as
    of the previous session's close (and, for "crosses", the one before), so a
    rule never sees the session it decides. A warming-up indicator makes its
    condition false.
    """

    weights: Mapping[str, float]
    entry: Mapping[str, Any]
    exit: Mapping[str, Any]
    name: str = "rules"

    def _indicators(self) -> dict[str, Mapping[str, Any]]:
        out: dict[str, Mapping[str, Any]] = {}
        for rules in (self.entry, self.exit):
            for c in rules["conditions"]:
                for side in (c["left"], c["right"]):
                    out[_key(side)] = side
        return out

    def indicators(self, sessions: Sessions) -> Mapping[tuple[str, str], Sequence[float | None]]:
        # The value listed under session D is the indicator after D-1's close ("now"), and after D-2's ("before").
        series: dict[tuple[str, str], Sequence[float | None]] = {}
        for symbol in self.weights:
            closes = sessions.closes[symbol]
            extra = (sessions.extras or {}).get(symbol)
            bars = [
                {"close": c, "high": extra["high"][i], "low": extra["low"][i], "volume": extra["volume"][i]} if extra else {"close": c, "high": c, "low": c, "volume": NAN}
                for i, c in enumerate(closes)
            ]
            for key, indicator in self._indicators().items():
                values = indicator_series_from_bars(indicator, bars)
                series[(f"now:{key}", symbol)] = [NAN] + values[:-1]
                series[(f"before:{key}", symbol)] = [NAN, NAN] + values[:-2]
        return series

    def _holds(self, rules: Mapping[str, Any], ctx: DecisionContext, symbol: str) -> bool:
        def at(when: str, indicator) -> float:
            value = ctx.indicator(f"{when}:{_key(indicator)}", symbol)
            return NAN if value is None else value

        def check(c) -> bool:
            l, r = at("now", c["left"]), at("now", c["right"])
            op = c["op"]
            if op == "above":
                return l > r
            if op == "below":
                return l < r
            if op == "crosses-above":
                return at("before", c["left"]) <= at("before", c["right"]) and l > r
            return at("before", c["left"]) >= at("before", c["right"]) and l < r

        results = (check(c) for c in rules["conditions"])
        return all(results) if rules["combine"] == "all" else any(results)

    def decide(self, ctx: DecisionContext) -> Target | None:
        target: Target = {}
        changed = False
        for symbol, weight in self.weights.items():
            in_market = ctx.shares[symbol] > 0
            stay = (not self._holds(self.exit, ctx, symbol)) if in_market else self._holds(self.entry, ctx, symbol)
            target[symbol] = weight if stay else 0.0
            if stay != in_market:
                changed = True
        return target if changed else None


# ---------------------------------------------------------------------------
# Momentum rotation and risk parity among the chosen stocks
# ---------------------------------------------------------------------------


@dataclass
class MomentumRotation:
    """
    At the start of each month, hold the `top` chosen stocks with the highest
    return over the last `lookback_months` (21 sessions each), 1/top of the
    money in each. With `absolute`, a pick whose return was negative is left
    in cash. Waits in cash until every stock has enough completed sessions.
    """

    weights: Mapping[str, float]
    top: int
    lookback_months: int
    absolute: bool
    name: str = "momentum-rotation"

    def indicators(self, sessions: Sessions) -> Mapping[tuple[str, str], Sequence[float | None]]:
        return {}

    def decide(self, ctx: DecisionContext) -> Target | None:
        if ctx.day != 0 and not starts_month(ctx):
            return None
        sessions = self.lookback_months * 21
        symbols = list(self.weights)
        if any(len(ctx.history.closes(s)) <= sessions for s in symbols):
            return None
        scores = []
        for i, s in enumerate(symbols):
            closes = ctx.history.closes(s)
            scores.append((-(closes[-1] / closes[-1 - sessions] - 1), i, s))
        scores.sort()  # highest return first; ties in listed order
        picks = [s for score, _, s in scores[: self.top] if not self.absolute or -score > 0]
        return {s: (1 / self.top if s in picks else 0.0) for s in symbols}


def return_volatility(closes: Sequence[float], count: int) -> float:
    """Sample standard deviation of the last `count` daily returns, summed left to right (as strategies.ts does)."""
    returns = [closes[i] / closes[i - 1] - 1 for i in range(len(closes) - count, len(closes))]
    total = 0.0
    for r in returns:
        total = total + r
    mean = total / len(returns)
    squares = 0.0
    for r in returns:
        squares = squares + (r - mean) ** 2
    return math.sqrt(squares / (len(returns) - 1))


@dataclass
class RiskParity:
    """Weight each chosen stock by 1 / its volatility over the last `lookback` daily returns; reset monthly or quarterly."""

    weights: Mapping[str, float]
    frequency: str
    lookback: int = 63
    name: str = "risk-parity"

    def indicators(self, sessions: Sessions) -> Mapping[tuple[str, str], Sequence[float | None]]:
        return {}

    def decide(self, ctx: DecisionContext) -> Target | None:
        every = 1 if self.frequency == "monthly" else 3
        due = ctx.day == 0 or (starts_month(ctx) and months_started(ctx) % every == 0)
        symbols = list(self.weights)
        if not due or any(len(ctx.history.closes(s)) <= self.lookback for s in symbols):
            return None
        volatility = [return_volatility(ctx.history.closes(s), self.lookback) for s in symbols]
        if any(v == 0 for v in volatility):
            return None  # a flat price: no volatility to divide by
        inverse = [1 / v for v in volatility]
        total = 0.0
        for x in inverse:
            total = total + x
        return {s: inverse[i] / total for i, s in enumerate(symbols)}


@dataclass
class Optimised:
    """
    At the start of each month (or quarter), re-optimise the weights from the
    completed sessions only: minimum variance, or maximum Sharpe ratio, from
    the last `lookback_months` of daily returns (21 sessions a month), with
    the same toned-down estimates and 40% cap as the portfolio page
    (optimisation.py). Until there are MIN_SESSIONS of returns to estimate
    from, it holds equal weights.
    """

    weights: Mapping[str, float]
    objective: str
    frequency: str
    lookback_months: int
    name: str = "optimised"

    #: The fewest daily returns an estimate is made from (about three months).
    MIN_SESSIONS = 63

    def __post_init__(self):
        if len(self.weights) < 2:
            raise InputError("Optimising needs at least two stocks to weight.")

    def indicators(self, sessions: Sessions) -> Mapping[tuple[str, str], Sequence[float | None]]:
        return {}

    def decide(self, ctx: DecisionContext) -> Target | None:
        import numpy as np
        import pandas as pd

        from .optimisation import default_cap, maximum_sharpe, minimum_variance, shrink_returns, shrunk_covariance

        every = 1 if self.frequency == "monthly" else 3
        if not (ctx.day == 0 or (starts_month(ctx) and months_started(ctx) % every == 0)):
            return None
        symbols = list(self.weights)
        available = min(len(ctx.history.closes(s)) for s in symbols) - 1
        if available < self.MIN_SESSIONS:
            return {s: 1 / len(symbols) for s in symbols}
        count = min(available, self.lookback_months * 21)
        closes = np.array([ctx.history.last(s, count + 1) for s in symbols], dtype=float).T
        returns = pd.DataFrame(closes[1:] / closes[:-1] - 1, columns=symbols)
        if (returns.std() == 0).any():
            return {s: 1 / len(symbols) for s in symbols}  # a flat price: nothing to estimate risk from
        cov = shrunk_covariance(returns)
        cap = default_cap(len(symbols))
        w = minimum_variance(cov, cap) if self.objective == "min-variance" else maximum_sharpe(shrink_returns(returns), cov, cap)
        return {s: float(w[i]) for i, s in enumerate(symbols)}
