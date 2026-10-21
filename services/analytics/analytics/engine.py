"""
MarketLab's backtesting engine in Python: the same simulation rules as the
TypeScript engine (lib/backtest/engine.ts and strategies.ts), so either can
calculate a run and they agree (tests/test_parity.py checks it).

This module puts the parts together and is the engine's public interface
(used by analytics/api.py, analytics/saved.py, notebooks and tests):

    data.py         validate prices; align them into shared trading sessions
    indicators.py   trailing indicators, already ending at the previous session
    strategies.py   decide a target from completed sessions only
    execution.py    fill orders at the session's close, with costs
    accounting.py   cash, shares, and a ledger row per session
    metrics.py      returns, drawdown, volatility, Sharpe, exposure

The timing rule, for every session D:

    1. decide   - the strategy sees sessions up to D-1 (closes, and indicators
                  computed from them). Session D's prices don't exist yet.
    2. execute  - its orders fill at D's close (plus or minus slippage).
    3. value    - the portfolio is valued at D's close; that's D's equity.

So a signal formed from session D's close can first trade at session D+1's
close. Nothing waits longer than that, and nothing trades sooner.

Warm-up (Config.warmup): a moving average needs `slow` earlier sessions.
- "within-period" (the default, as the TypeScript engine does): the first
  `slow` sessions of the measured period are its warm-up; the money is held
  in cash meanwhile, and they still count in every metric.
- "pre-start": up to `slow` sessions before the start date are used as
  earlier history, if the prices given include them. They're never measured:
  equity, trades, metrics and the benchmark all begin at the start date.

Prices are *adjusted* closes: past prices are scaled for later splits and
dividends, so a dividend is already part of the return. Dividends are never
added separately (that would count them twice).

Numerical note: sums are accumulated left to right, one number at a time,
exactly as JavaScript's reduce does (see indicators.py).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal, Mapping

import pandas as pd

from .accounting import DayRecord, Portfolio
from .data import MAX_POINTS, InputError, Sessions, align, to_series
from .execution import MIN_TRADE_VALUE, Costs, Trade, buy, execute_target
from .metrics import TRADING_DAYS_PER_YEAR, YEAR_MS, Metrics, compute_metrics
from .strategies import (
    Buy,
    BuyAndHold,
    DecisionContext,
    DollarCostAveraging,
    History,
    LookAheadError,
    MomentumRotation,
    MovingAverageCrossover,
    Rebalancing,
    RiskParity,
    Rules,
    Strategy,
    Target,
)

__all__ = [
    "ASSUMPTIONS", "ENGINE_NAME", "ENGINE_VERSION", "MARKET", "MAX_POINTS", "MIN_TRADE_VALUE", "TRADING_DAYS_PER_YEAR", "YEAR_MS",
    "Buy", "BuyAndHold", "Config", "Costs", "Decision", "DollarCostAveraging", "Rebalancing", "Rules", "DecisionContext", "DayRecord", "History", "InputError", "LookAheadError",
    "Metrics", "MovingAverageCrossover", "Outcome", "Run", "Sessions", "Strategy", "Target", "Trade", "Warmup",
    "align", "compute_metrics", "run_backtest", "run_config", "to_series",
]

ENGINE_NAME = "python"
ENGINE_VERSION = "1.2.0"

#: The rules every run follows, in words (recorded with results; matches lib/backtest/engines.ts ASSUMPTIONS).
ASSUMPTIONS = {
    "signals": "Decisions use closes up to the previous trading day only; orders fill at the day's close.",
    "prices": "Split- and dividend-adjusted daily closes. Dividends are part of the adjusted price and are never added again.",
    "shares": "Fractional shares. Buys never spend more than the cash left after the commission; sells never exceed the shares held, and selling out sells every share. Trades under $1 are skipped.",
    "costs": "A fixed commission per order; slippage in basis points fills buys above the close and sells below it.",
    "rebalancing": "A target sets each holding to a fraction of total value; sells are filled before buys.",
    "warmUp": "A moving-average crossover first trades once it has as many closes as its long average.",
    "benchmark": "Buying and holding the same stocks (or the market index) with the same money and costs, over exactly the strategy's days.",
    "calendar": "Only days every series has are used; a missing day is skipped for all of them.",
}

Warmup = Literal["within-period", "pre-start"]


@dataclass(frozen=True)
class Decision:
    """A session on which the strategy asked for a change, and what it asked for."""

    time: int
    target: Mapping[str, float]
    """Target weights, or (for a "buy" decision) dollar amounts to spend."""
    based_on: int | None
    """The last session whose prices the decision could use (the previous session), or None on the very first one."""
    kind: Literal["target", "buy"] = "target"


@dataclass(frozen=True)
class Run:
    equity: list[tuple[int, float]]
    """Total value (cash + holdings) at each measured session's close: (time, value)."""
    trades: list[Trade]
    metrics: Metrics
    ledger: list[DayRecord] = field(default_factory=list)
    """Each measured session's cash, shares and value, after its trades."""
    decisions: list[Decision] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"equity": self.equity, "trades": [asdict(t) for t in self.trades], "metrics": asdict(self.metrics)}


# ---------------------------------------------------------------------------
# The simulation
# ---------------------------------------------------------------------------


def simulate(sessions: Sessions, strategy: Strategy, *, initial_cash: float, costs: Costs) -> Run:
    """
    Runs a strategy over prepared sessions. Sessions before
    `sessions.first_measured` are history only: the strategy can read them,
    but nothing is decided, traded or measured on them.
    """
    if len(sessions) - sessions.first_measured < 2:
        raise InputError("Not enough price history in that date range.")
    symbols = list(sessions.closes)
    indicators = strategy.indicators(sessions)
    portfolio = Portfolio.starting(initial_cash, symbols)
    trades: list[Trade] = []
    equity: list[tuple[int, float]] = []
    ledger: list[DayRecord] = []
    decisions: list[Decision] = []
    invested = 0

    for day in range(sessions.first_measured, len(sessions)):
        time = sessions.times[day]
        # 1. Decide, from completed sessions only.
        ctx = DecisionContext(
            day=day - sessions.first_measured,
            time=time,
            first_measured_day=day == sessions.first_measured,
            history=History(sessions, day),
            shares=dict(portfolio.shares),
            cash=portfolio.cash,
            indicators={key: values[day] for key, values in indicators.items()},
        )
        target = strategy.decide(ctx)
        # 2. Execute at this session's close.
        closes = {s: sessions.closes[s][day] for s in symbols}
        if isinstance(target, Buy):
            decisions.append(Decision(time, dict(target.amounts), sessions.times[day - 1] if day > 0 else None, "buy"))
            for symbol, amount in target.amounts.items():
                if symbol in portfolio.shares and amount > 0 and (t := buy(portfolio, time, symbol, amount, closes[symbol], costs)):
                    trades.append(t)
        elif target is not None:
            decisions.append(Decision(time, dict(target), sessions.times[day - 1] if day > 0 else None))
            trades.extend(execute_target(portfolio, target, closes, time, costs))
        # 3. Value at this session's close.
        holdings = portfolio.holdings_value(closes)
        if holdings > 0:
            invested += 1
        total = portfolio.cash + holdings
        equity.append((time, total))
        ledger.append(DayRecord(time, portfolio.cash, dict(portfolio.shares), holdings, total, target is not None))

    return Run(
        equity=equity,
        trades=trades,
        metrics=compute_metrics(equity, len(trades), invested / len(equity)),
        ledger=ledger,
        decisions=decisions,
    )


def run_backtest(series: Mapping[str, pd.Series], strategy: Strategy, *, start: int, end: int, initial_cash: float, costs: Costs, history_before: int = 0) -> Run:
    """Aligns the series into sessions (with up to `history_before` earlier ones as history) and simulates."""
    return simulate(align(series, start, end, history_before=history_before), strategy, initial_cash=initial_cash, costs=costs)


# ---------------------------------------------------------------------------
# A whole configured run, with its benchmark
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Config:
    """The settings MarketLab's backtester uses (lib/backtest/config.ts), for the strategies this engine runs."""

    holdings: list[tuple[str, float]]
    strategy: Literal["buy-and-hold", "moving-average", "dollar-cost-averaging", "rebalancing", "rules", "momentum-rotation", "risk-parity"]
    start: int
    end: int
    initial_cash: float
    costs: Costs = field(default_factory=Costs)
    benchmark: Literal["same-stocks", "market"] = "same-stocks"
    fast: int | None = None
    slow: int | None = None
    warmup: Warmup = "within-period"
    installments: int | None = None
    frequency: Literal["monthly", "quarterly"] | None = None
    entry: Mapping | None = None
    exit: Mapping | None = None
    top: int | None = None
    lookback_months: int | None = None
    absolute: bool | None = None


@dataclass(frozen=True)
class Outcome:
    run: Run
    benchmark: Run
    warnings: list[str]


MARKET = "MARKET"


def run_config(config: Config, prices: Mapping[str, pd.Series], market: pd.Series | None = None) -> Outcome:
    """Runs the configured strategy and its benchmark over the same measured sessions."""
    weights = {symbol: weight for symbol, weight in config.holdings}
    missing = [s for s in weights if s not in prices]
    if missing:
        raise InputError(f"No prices were given for {', '.join(missing)}.")
    if config.warmup not in ("within-period", "pre-start"):
        raise InputError('The warm-up must be "within-period" or "pre-start".')
    series = {s: prices[s] for s in weights}
    warnings: list[str] = []

    history_before = 0
    if config.strategy == "buy-and-hold":
        strategy: Strategy = BuyAndHold(weights)
    elif config.strategy == "dollar-cost-averaging":
        if not config.installments or config.installments < 1:
            raise InputError("Dollar-cost averaging needs a number of installments.")
        strategy = DollarCostAveraging(weights, config.installments)
    elif config.strategy == "momentum-rotation":
        if not config.top or config.top > len(weights) or config.lookback_months not in (3, 6, 12) or config.absolute is None:
            raise InputError("Momentum rotation needs how many stocks to hold (up to the number listed) and a 3, 6 or 12-month look-back.")
        strategy = MomentumRotation(weights, config.top, config.lookback_months, config.absolute)
    elif config.strategy == "risk-parity":
        if config.frequency not in ("monthly", "quarterly"):
            raise InputError("Risk parity needs a frequency: monthly or quarterly.")
        strategy = RiskParity(weights, config.frequency)
    elif config.strategy == "rebalancing":
        if config.frequency not in ("monthly", "quarterly"):
            raise InputError("Rebalancing needs a frequency: monthly or quarterly.")
        strategy = Rebalancing(weights, config.frequency)
    elif config.strategy == "rules":
        if not config.entry or not config.exit:
            raise InputError("A rule strategy needs entry and exit rules.")
        strategy = Rules(weights, config.entry, config.exit)
    else:
        if config.fast is None or config.slow is None:
            raise InputError("A moving-average crossover needs a short and a long average.")
        strategy = MovingAverageCrossover(weights, config.fast, config.slow)
        history_before = config.slow if config.warmup == "pre-start" else 0

    sessions = align(series, config.start, config.end, history_before=history_before)
    run = simulate(sessions, strategy, initial_cash=config.initial_cash, costs=config.costs)
    if config.strategy == "moving-average":
        slow = config.slow
        if config.warmup == "pre-start":
            if sessions.first_measured < slow:
                warnings.append(
                    f"Only {sessions.first_measured} sessions before the start date were available for the {slow}-day average's warm-up, "
                    f"so it first trades after {slow - sessions.first_measured} measured sessions."
                )
            if len(sessions) <= slow:
                warnings.append(f"The {slow}-day average needs {slow} days of prices before the first signal; there were {len(sessions)}, so the strategy never traded.")
        elif len(run.equity) <= slow:
            warnings.append(
                f"The {slow}-day average needs {slow} days of prices before the first signal; "
                f"this range has {len(run.equity)}, so the strategy never traded."
            )

    # The benchmark runs on exactly the measured sessions, with the same money and costs.
    first, last = run.equity[0][0], run.equity[-1][0]
    if config.benchmark == "market":
        if market is None:
            raise InputError("The market benchmark needs the market index's prices.")
        benchmark = run_backtest({MARKET: market}, BuyAndHold({MARKET: 1.0}), start=first, end=last, initial_cash=config.initial_cash, costs=config.costs)
    else:
        benchmark = run_backtest(series, BuyAndHold(weights), start=first, end=last, initial_cash=config.initial_cash, costs=config.costs)
    return Outcome(run=run, benchmark=benchmark, warnings=warnings)
