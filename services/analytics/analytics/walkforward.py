"""
Walk-forward testing of a moving-average crossover: does picking the best
settings on the past actually help on the future?

The sessions are split into folds. For each fold:

1. Train: every (short, long) pair in the grid runs on the `train` sessions
   before the fold; the pair with the best Sharpe ratio is chosen.
2. Test: the chosen pair runs on the fold's `test` sessions, which come
   right after and were never seen while choosing. Its averages may warm up
   on earlier sessions (pre-start warm-up), which is fine: they're in the past.

The test windows don't overlap and are chained into one out-of-sample equity
curve. It's compared with the base settings and with buying and holding,
over exactly the same test sessions. "Efficiency" is the average
out-of-sample Sharpe over the average in-sample (training) best: well below 1
means the training results were mostly fitted noise.

Every run uses the same engine, rules and costs as a normal backtest.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

import pandas as pd

from .data import InputError, Sessions, align
from .engine import Config, Run, simulate
from .indicators import sma_through_previous
from .metrics import compute_metrics
from .strategies import BuyAndHold, MovingAverageCrossover

MAX_COMBINATIONS = 100
MAX_FOLDS = 12


class _CachedCrossover(MovingAverageCrossover):
    """A crossover whose averages come from a shared cache, so a grid computes each window once per fold."""

    def __init__(self, weights, fast, slow, cache):
        super().__init__(weights, fast, slow)
        self._cache = cache

    def indicators(self, sessions: Sessions):
        series = {}
        for symbol in self.weights:
            for name, window in (("fast", self.fast), ("slow", self.slow)):
                # The window's first day and length identify it (an object's id can be reused once it's freed).
                key = (sessions.times[0], len(sessions), symbol, window)
                if key not in self._cache:
                    self._cache[key] = sma_through_previous(sessions.closes[symbol], window)
                series[(name, symbol)] = self._cache[key]
        return series


def _slice(sessions: Sessions, start: int, end: int, history: int) -> Sessions:
    """Sessions [start, end) measured, with up to `history` earlier ones as warm-up."""
    first = max(0, start - history)
    return Sessions(
        times=sessions.times[first:end],
        closes={s: c[first:end] for s, c in sessions.closes.items()},
        first_measured=start - first,
    )


def _chain(runs: Sequence[Run], initial_cash: float) -> list[tuple[int, float]]:
    """The test runs' equity curves joined end to end, each continuing from where the last one finished."""
    equity: list[tuple[int, float]] = []
    level = initial_cash
    for run in runs:
        start = run.equity[0][1]
        equity += [(t, level * v / start) for t, v in run.equity]
        level = equity[-1][1]
    return equity


def _metrics_dict(equity: list[tuple[int, float]], trades: int, exposure: float) -> dict[str, Any]:
    """The metrics as MarketLab's TypeScript types name them (camelCase)."""
    m = compute_metrics(equity, trades, exposure)
    clean = lambda v: None if v is None or (isinstance(v, float) and not math.isfinite(v)) else v
    camel = lambda name: name.split("_")[0] + "".join(part.title() for part in name.split("_")[1:])
    return {camel(k): clean(v) for k, v in m.__dict__.items()}


@dataclass(frozen=True)
class Grid:
    fast: Sequence[int]
    slow: Sequence[int]


def walk_forward(prices: Mapping[str, pd.Series], config: Config, grid: Grid, train_sessions: int, test_sessions: int) -> dict[str, Any]:
    weights = dict(config.holdings)
    pairs = [(f, s) for f in grid.fast for s in grid.slow if 2 <= f < s]
    if not pairs:
        raise InputError("No short average in the grid is shorter than a long one.")
    if len(pairs) > MAX_COMBINATIONS:
        raise InputError(f"That's {len(pairs)} combinations; walk-forward testing allows up to {MAX_COMBINATIONS}.")
    longest = max(s for _, s in pairs + [(config.fast or 2, config.slow or 3)])
    # Everything up to the end date, with earlier sessions available for warm-up.
    sessions = align({s: prices[s] for s in weights}, config.start, config.end, history_before=longest)
    start = sessions.first_measured
    first_test = start + train_sessions
    if first_test + 20 > len(sessions):
        raise InputError("The date range is too short for a training window and at least one test window.")
    folds = []
    test_start = first_test
    while test_start < len(sessions) and len(folds) < MAX_FOLDS:
        test_end = min(test_start + test_sessions, len(sessions))
        if test_end - test_start >= 20:
            folds.append((test_start - train_sessions, test_start, test_end))
        test_start = test_end

    cache: dict = {}
    results, chosen_runs, base_runs, hold_runs = [], [], [], []
    for train_start, test_start, test_end in folds:
        train = _slice(sessions, train_start, test_start, longest)
        scores = []
        for fast, slow in pairs:
            run = simulate(train, _CachedCrossover(weights, fast, slow, cache), initial_cash=config.initial_cash, costs=config.costs)
            sharpe = run.metrics.sharpe
            scores.append((sharpe if sharpe is not None else -math.inf, run.metrics.total_return, fast, slow))
        best_sharpe, _, fast, slow = max(scores)
        test = _slice(sessions, test_start, test_end, longest)
        chosen = simulate(test, _CachedCrossover(weights, fast, slow, cache), initial_cash=config.initial_cash, costs=config.costs)
        base = simulate(test, _CachedCrossover(weights, config.fast, config.slow, cache), initial_cash=config.initial_cash, costs=config.costs)
        hold = simulate(test, BuyAndHold(weights), initial_cash=config.initial_cash, costs=config.costs)
        chosen_runs.append(chosen)
        base_runs.append(base)
        hold_runs.append(hold)
        results.append({
            "trainStart": sessions.times[train_start],
            "testStart": sessions.times[test_start],
            "testEnd": sessions.times[test_end - 1],
            "fast": fast,
            "slow": slow,
            "inSampleSharpe": None if best_sharpe == -math.inf else round(best_sharpe, 4),
            "outOfSampleSharpe": None if chosen.metrics.sharpe is None else round(chosen.metrics.sharpe, 4),
            "outOfSampleReturn": round(chosen.metrics.total_return, 6),
            "baseReturn": round(base.metrics.total_return, 6),
            "holdReturn": round(hold.metrics.total_return, 6),
        })

    def combined(runs: Sequence[Run]) -> dict[str, Any]:
        equity = _chain(runs, config.initial_cash)
        days = sum(len(r.equity) for r in runs)
        invested = sum(r.metrics.exposure * len(r.equity) for r in runs)
        return {"equity": [[t, round(v, 2)] for t, v in equity], "metrics": _metrics_dict(equity, sum(r.metrics.trades for r in runs), invested / days)}

    in_sample = [r["inSampleSharpe"] for r in results if r["inSampleSharpe"] is not None]
    out_sample = [r["outOfSampleSharpe"] for r in results if r["outOfSampleSharpe"] is not None]
    mean_in = sum(in_sample) / len(in_sample) if in_sample else None
    mean_out = sum(out_sample) / len(out_sample) if out_sample else None
    return {
        "folds": results,
        "combinations": len(pairs),
        "trainSessions": train_sessions,
        "testSessions": test_sessions,
        "walkForward": combined(chosen_runs),
        "base": combined(base_runs),
        "buyAndHold": combined(hold_runs),
        "meanInSampleSharpe": None if mean_in is None else round(mean_in, 4),
        "meanOutOfSampleSharpe": None if mean_out is None else round(mean_out, 4),
        "efficiency": round(mean_out / mean_in, 4) if mean_in and mean_out is not None and mean_in > 0 else None,
    }
