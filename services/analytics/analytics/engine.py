"""
MarketLab's backtesting engine in Python: the same simulation rules as the
TypeScript engine (lib/backtest/engine.ts and strategies.ts), so either can
calculate a run and they agree (tests/test_parity.py checks it).

Pure functions on plain data: no web framework, no I/O. Usable from the API
(analytics/api.py), notebooks and unit tests alike.

Simulation rules, as in the TypeScript engine:

- Each day the strategy sees closes up to *yesterday* only, decides what it
  wants to hold, and orders fill at *today's* close. It's never given today's
  price, so it can't trade on a price it couldn't have known.
- Shares are fractional. A buy can't spend more than the cash left after its
  commission; a sell can't sell more than is held. Trades under $1 are skipped.
- Costs: a fixed commission per order, and slippage in basis points that fills
  buys above the close and sells below it.
- A "target" decision sets each holding to a fraction of total value; sells
  happen before buys, so their cash is there for the buys.
- The benchmark is buying and holding (the same stocks at the same weights, or
  the market index) over exactly the days the strategy ran.

Prices are *adjusted* closes: past prices are scaled for later splits and
dividends, so a dividend is already part of the return. Dividends are never
added separately (that would count them twice).

Numerical note: averages and sums are accumulated left to right, one number
at a time, exactly as JavaScript's reduce does. Python's sum() and NumPy use
more accurate (compensated or pairwise) summation; that differs in the last
digit, and a moving-average crossover can turn a last-digit difference into a
trade on a different day.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Callable, Literal, Mapping, Sequence

import numpy as np
import pandas as pd

ENGINE_NAME = "python"
ENGINE_VERSION = "1.0.0"

TRADING_DAYS_PER_YEAR = 252
YEAR_MS = 365.25 * 24 * 60 * 60 * 1000
#: Trades smaller than this are skipped, so rounding never creates commission-only orders.
MIN_TRADE_VALUE = 1.0
#: The most daily prices a series may have (about 15 years); keeps a request bounded.
MAX_POINTS = 4000


class InputError(ValueError):
    """Inputs the engine refuses, with a message fit to show a user."""


@dataclass(frozen=True)
class Costs:
    commission: float = 0.0
    """Dollars per order."""
    slippage_bps: float = 0.0
    """Basis points (0.01%) the fill is worse than the close."""


@dataclass(frozen=True)
class Trade:
    time: int
    symbol: str
    side: Literal["buy", "sell"]
    shares: float
    price: float
    """The fill price per share, after slippage."""
    commission: float


@dataclass(frozen=True)
class Metrics:
    final_value: float
    total_return: float
    cagr: float
    max_drawdown: float
    drawdown_peak: int | None
    drawdown_trough: int | None
    volatility: float
    sharpe: float | None
    trades: int
    exposure: float


@dataclass(frozen=True)
class Run:
    equity: list[tuple[int, float]]
    """Total value (cash + holdings) at each day's close: (time, value)."""
    trades: list[Trade]
    metrics: Metrics

    def to_dict(self) -> dict:
        return {"equity": self.equity, "trades": [asdict(t) for t in self.trades], "metrics": asdict(self.metrics)}


@dataclass(frozen=True)
class Context:
    """What a strategy may look at when deciding on day `day`."""

    day: int
    times: Sequence[int]
    """Every day's timestamp; dates are known in advance, prices aren't."""
    closes: Mapping[str, Sequence[float]]
    """Every day's close. A strategy may only read indices before `day` (see `seen`)."""
    shares: Mapping[str, float]
    cash: float

    def seen(self, symbol: str) -> Sequence[float]:
        """Closes up to and including yesterday: everything the strategy may know."""
        return self.closes[symbol][: self.day]


#: What a strategy asks for: hold these fractions of total value in each symbol (the rest in cash).
Target = dict[str, float]
Strategy = Callable[[Context], Target | None]


def _sequential_sum(values: Sequence[float]) -> float:
    total = 0.0
    for v in values:
        total = total + v
    return total


def _average(values: Sequence[float], count: int) -> float:
    """The mean of the last `count` values, summed left to right (see the module note)."""
    return _sequential_sum(values[len(values) - count :]) / count


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------


def buy_and_hold(weights: Mapping[str, float]) -> Strategy:
    """Invest everything on the first day, then never trade."""
    target = dict(weights)
    return lambda ctx: dict(target) if ctx.day == 0 else None


def moving_average_crossover(weights: Mapping[str, float], fast: int, slow: int) -> Strategy:
    """
    Per stock: hold it (at its weight) while its average close over the last
    `fast` days is above the average over the last `slow` days; hold its share
    in cash otherwise. Starts once there are `slow` days of history, and only
    trades on a crossover, not every day.
    """
    if not (2 <= fast < slow):
        raise InputError("The short average must be at least 2 days and shorter than the long one.")
    symbols = list(weights)

    def decide(ctx: Context) -> Target | None:
        # ctx.day closes are known (yesterday's and before); a signal needs `slow` of them.
        if ctx.day < slow:
            return None
        target: Target = {}
        changed = False
        for s in symbols:
            # Only the last `slow` known closes: the same numbers as ctx.seen(s), without copying all of them.
            window = ctx.closes[s][ctx.day - slow : ctx.day]
            uptrend = _average(window, fast) > _average(window, slow)
            target[s] = weights[s] if uptrend else 0.0
            if uptrend != (ctx.shares[s] > 0):
                changed = True
        return target if changed else None

    return decide


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


def to_series(symbol: str, times: Sequence[int], prices: Sequence[float]) -> pd.Series:
    """
    A validated daily series, indexed by timestamp. Refuses what the
    simulation can't use: mismatched lengths, too many points, duplicate or
    unsorted dates, and prices that aren't finite and positive.
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
    values = np.asarray(prices, dtype=np.float64)
    if not np.all(np.isfinite(values)) or np.any(values <= 0):
        raise InputError(f"{symbol}: every price must be a positive, finite number.")
    return pd.Series(values, index=index, name=symbol)


def align(series: Mapping[str, pd.Series], start: int, end: int) -> tuple[list[int], dict[str, list[float]]]:
    """
    The days every series has, between `start` and `end` (inclusive), in the
    first series' order, with each symbol's closes on those days. A day
    missing from any series is left out for all of them.
    """
    symbols = list(series)
    first = series[symbols[0]].index
    days = first[(first >= start) & (first <= end)]
    for s in symbols[1:]:
        days = days[days.isin(series[s].index)]
    times = [int(t) for t in days]
    # .tolist() gives Python floats, so every step below is ordinary float arithmetic.
    return times, {s: series[s].loc[days].tolist() for s in symbols}


# ---------------------------------------------------------------------------
# The simulation
# ---------------------------------------------------------------------------


def run_backtest(series: Mapping[str, pd.Series], strategy: Strategy, *, start: int, end: int, initial_cash: float, costs: Costs) -> Run:
    times, closes = align(series, start, end)
    if len(times) < 2:
        raise InputError("Not enough price history in that date range.")
    symbols = list(series)
    slip = costs.slippage_bps / 10_000

    cash = float(initial_cash)
    shares = {s: 0.0 for s in symbols}
    trades: list[Trade] = []
    equity: list[tuple[int, float]] = []
    invested_days = 0

    def fill(time: int, symbol: str, side: str, value: float, close: float) -> None:
        nonlocal cash
        # `value` is dollars at the close; slippage moves the fill price against us.
        price = close * (1 + slip) if side == "buy" else close * (1 - slip)
        if side == "buy":
            spend = min(value, cash - costs.commission)  # can't spend money we don't have
            if spend < MIN_TRADE_VALUE:
                return
            qty = spend / price
            cash -= spend + costs.commission
            shares[symbol] += qty
        else:
            qty = min(value / close, shares[symbol])  # can't sell more than we hold
            if qty * close < MIN_TRADE_VALUE:
                return
            cash += qty * price - costs.commission
            shares[symbol] -= qty
        trades.append(Trade(time, symbol, side, qty, price, costs.commission))

    for day, time in enumerate(times):
        today = {s: closes[s][day] for s in symbols}
        decision = strategy(Context(day=day, times=times[: day + 1], closes=closes, shares=dict(shares), cash=cash))
        if decision is not None:
            held = 0.0
            for s in symbols:
                held = held + shares[s] * today[s]
            total = cash + held
            deltas = [(s, decision.get(s, 0.0) * total - shares[s] * today[s]) for s in symbols]
            # Sell first, so the cash is there for the buys.
            for s, delta in deltas:
                if delta < 0:
                    fill(time, s, "sell", -delta, today[s])
            for s, delta in deltas:
                if delta > 0:
                    fill(time, s, "buy", delta, today[s])

        holdings = 0.0
        for s in symbols:
            holdings = holdings + shares[s] * today[s]
        if holdings > 0:
            invested_days += 1
        equity.append((time, cash + holdings))

    return Run(equity=equity, trades=trades, metrics=compute_metrics(equity, len(trades), invested_days / len(times)))


def compute_metrics(equity: Sequence[tuple[int, float]], trades: int, exposure: float) -> Metrics:
    first = equity[0][1]
    last = equity[-1][1]
    years = (equity[-1][0] - equity[0][0]) / YEAR_MS

    returns = [equity[i + 1][1] / equity[i][1] - 1 for i in range(len(equity) - 1)]
    mean = _sequential_sum(returns) / len(returns)
    variance = 0.0
    if len(returns) > 1:
        squares = 0.0
        for r in returns:
            squares = squares + (r - mean) ** 2
        variance = squares / (len(returns) - 1)
    sd = math.sqrt(variance)

    peak = equity[0]
    max_drawdown = 0.0
    drawdown_peak: int | None = None
    drawdown_trough: int | None = None
    for point in equity:
        if point[1] > peak[1]:
            peak = point
        drawdown = 1 - point[1] / peak[1]
        if drawdown > max_drawdown:
            max_drawdown = drawdown
            drawdown_peak = peak[0]
            drawdown_trough = point[0]

    return Metrics(
        final_value=last,
        total_return=last / first - 1,
        cagr=(last / first) ** (1 / years) - 1 if years > 0 else 0.0,
        max_drawdown=max_drawdown,
        drawdown_peak=drawdown_peak,
        drawdown_trough=drawdown_trough,
        volatility=sd * math.sqrt(TRADING_DAYS_PER_YEAR),
        sharpe=(mean / sd) * math.sqrt(TRADING_DAYS_PER_YEAR) if sd > 1e-12 else None,
        trades=trades,
        exposure=exposure,
    )


# ---------------------------------------------------------------------------
# A whole configured run, with its benchmark
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Config:
    """The settings MarketLab's backtester uses (lib/backtest/config.ts), for the strategies this engine runs."""

    holdings: list[tuple[str, float]]
    strategy: Literal["buy-and-hold", "moving-average"]
    start: int
    end: int
    initial_cash: float
    costs: Costs = field(default_factory=Costs)
    benchmark: Literal["same-stocks", "market"] = "same-stocks"
    fast: int | None = None
    slow: int | None = None


@dataclass(frozen=True)
class Outcome:
    run: Run
    benchmark: Run
    warnings: list[str]


MARKET = "MARKET"


def run_config(config: Config, prices: Mapping[str, pd.Series], market: pd.Series | None = None) -> Outcome:
    """Runs the configured strategy and its benchmark over the same days."""
    weights = {symbol: weight for symbol, weight in config.holdings}
    missing = [s for s in weights if s not in prices]
    if missing:
        raise InputError(f"No prices were given for {', '.join(missing)}.")
    series = {s: prices[s] for s in weights}
    warnings: list[str] = []

    if config.strategy == "buy-and-hold":
        strategy = buy_and_hold(weights)
    else:
        if config.fast is None or config.slow is None:
            raise InputError("A moving-average crossover needs a short and a long average.")
        strategy = moving_average_crossover(weights, config.fast, config.slow)

    run = run_backtest(series, strategy, start=config.start, end=config.end, initial_cash=config.initial_cash, costs=config.costs)
    if config.strategy == "moving-average" and len(run.equity) <= (config.slow or 0):
        warnings.append(
            f"The {config.slow}-day average needs {config.slow} days of prices before the first signal; "
            f"this range has {len(run.equity)}, so the strategy never traded."
        )

    # The benchmark runs on exactly the days the strategy did, with the same money and costs.
    first, last = run.equity[0][0], run.equity[-1][0]
    if config.benchmark == "market":
        if market is None:
            raise InputError("The market benchmark needs the market index's prices.")
        benchmark = run_backtest({MARKET: market}, buy_and_hold({MARKET: 1.0}), start=first, end=last, initial_cash=config.initial_cash, costs=config.costs)
    else:
        benchmark = run_backtest(series, buy_and_hold(weights), start=first, end=last, initial_cash=config.initial_cash, costs=config.costs)
    return Outcome(run=run, benchmark=benchmark, warnings=warnings)
