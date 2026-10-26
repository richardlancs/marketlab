"""
"Was it luck?": how a single backtest compares with random versions of
itself, and how sure its Sharpe ratio is.

Random versions (1,000 of them), for strategies that make choices:

- Timing (moving-average crossover, custom rules): each stock is held or
  not on each day. A random version holds each stock in as many separate
  stretches, for as many days in all, as the strategy did, but at random
  dates. So it trades as often and is invested as much; only the timing is
  left to chance.
- Picking (momentum rotation, risk parity, optimised): at each of the
  strategy's decisions, its weights are handed to the stocks in a random
  order. So it rebalances on the same days with the same concentration;
  only which stock gets which weight is left to chance.

Buy and hold, dollar-cost averaging and rebalancing make no choice to test,
so they get no random versions.

To compare like with like, the strategy and its random versions are valued
the same simple way: each day's return is the weighted sum of the stocks'
returns, with the weights held since the previous close, minus trading costs
(slippage on the value traded, and each order's commission against the
starting money) on the days positions change. That's close to, not exactly,
the engine's own numbers, which the results page shows.

The Sharpe range is a block bootstrap of the run's own daily returns (from
the engine's values): 2,000 resamples of 21-session blocks, the strategy's
and the benchmark's drawn from the same days, so how often the strategy's
Sharpe beats the benchmark's is a paired comparison.

Seeded by the inputs, so the same run always gets the same answer.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping
from typing import Any

import numpy as np
import pandas as pd

from . import engine

TRIALS = 1000
RESAMPLES = 2000
BLOCK = 21
BINS = 30
TIMING = {"moving-average", "rules"}
PICKING = {"momentum-rotation", "risk-parity", "optimised"}


def _n(value: Any, digits: int = 6) -> float | None:
    if value is None:
        return None
    value = float(value)
    return round(value, digits) if math.isfinite(value) else None


def _stats(daily: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Total return and annualised Sharpe ratio of each row of daily returns (NaN where the returns never vary)."""
    total = np.prod(1 + daily, axis=1) - 1
    sd = daily.std(axis=1, ddof=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        sharpe = np.where(sd > 1e-12, daily.mean(axis=1) / sd * math.sqrt(engine.TRADING_DAYS_PER_YEAR), np.nan)
    return total, sharpe


def _percentile(value: float, sample: np.ndarray) -> float | None:
    """The share of `sample` below `value`, counting ties as half."""
    sample = sample[np.isfinite(sample)]
    if not math.isfinite(value) or len(sample) == 0:
        return None
    return float((np.sum(sample < value) + 0.5 * np.sum(sample == value)) / len(sample))


def _random_runs(held: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """
    A random 0/1 sequence as long as `held` with as many separate runs of 1s
    and as many 1s in all, the runs and gaps at random places.
    """
    length = len(held)
    days = int(held.sum())
    if days == 0 or days == length:
        return held.copy()
    runs = int(np.sum(np.diff(np.concatenate([[0], held.astype(int)])) == 1))
    # Run lengths: `days` split into `runs` positive parts.
    cuts = np.sort(rng.choice(np.arange(1, days), size=runs - 1, replace=False)) if runs > 1 else np.array([], dtype=int)
    on = np.diff(np.concatenate([[0], cuts, [days]]))
    # Gaps: before, between (at least one day each) and after the runs.
    spare = length - days - (runs - 1)
    bars = np.sort(rng.choice(np.arange(spare + runs), size=runs, replace=False))
    off = np.diff(np.concatenate([[-1], bars, [spare + runs]])) - 1
    off[1:-1] += 1
    out = np.zeros(length, dtype=bool)
    position = 0
    for i in range(runs):
        position += off[i]
        out[position : position + on[i]] = True
        position += on[i]
    return out


def luck(config: engine.Config, prices: Mapping[str, pd.Series], market: pd.Series | None = None, extras: Mapping[str, pd.DataFrame] | None = None) -> dict[str, Any]:
    outcome = engine.run_config(config, prices, market, extras)
    run = outcome.run
    times = [t for t, _ in run.equity]
    symbols = [s for s, _ in config.holdings]
    weights = np.array([w for _, w in config.holdings])
    closes = np.array([prices[s].reindex(times).to_numpy(dtype=float) for s in symbols]).T  # sessions × stocks
    returns = closes[1:] / closes[:-1] - 1  # return on each session after the first
    seed_text = json.dumps({"config": repr(config), "first": times[0], "last": times[-1], "sum": round(float(np.nansum(closes)), 6)}, sort_keys=True)
    rng = np.random.default_rng(int(hashlib.sha256(seed_text.encode()).hexdigest()[:16], 16))
    slip = config.costs.slippage_bps / 10_000
    commission = config.costs.commission / config.initial_cash

    kind = "timing" if config.strategy in TIMING else "picking" if config.strategy in PICKING else None
    notes: list[str] = []
    random_versions = None
    if kind == "timing":
        # Held after each session's trades, for the next session's return.
        held = np.array([[row.shares[s] > 0 for s in symbols] for row in run.ledger[:-1]])

        def value(h: np.ndarray) -> np.ndarray:
            """Daily returns of holdings `h` (… × sessions × stocks), with costs on the sessions positions change."""
            gross = (h * returns * weights).sum(axis=-1)
            before = np.concatenate([np.zeros_like(h[..., :1, :]), h[..., :-1, :]], axis=-2)
            changes = h != before
            return gross - (changes * (weights * slip + commission)).sum(axis=-1)

        actual = value(held[None])[0]
        if held.any():
            trials = np.empty((TRIALS, len(held)))
            for i in range(TRIALS):
                trials[i] = value(np.stack([_random_runs(held[:, j], rng) for j in range(len(symbols))], axis=1)[None])[0]
            random_versions = trials
        else:
            notes.append("The strategy never held anything, so there's no timing to compare.")
    elif kind == "picking":
        index = {t: i for i, t in enumerate(times)}
        decisions = [(index[d.time], np.array([d.target.get(s, 0.0) for s in symbols])) for d in run.decisions if d.time in index]
        segment = np.full(len(returns), -1)
        for d, (at, _) in enumerate(decisions):
            segment[at:] = d  # held from the decision's close, so for the next session's return onwards
        targets = np.array([w for _, w in decisions]) if decisions else np.zeros((0, len(symbols)))

        def value(chosen: np.ndarray) -> np.ndarray:
            """Daily returns when the decisions' weights are `chosen` (… × decisions × stocks)."""
            w = np.concatenate([np.zeros_like(chosen[..., :1, :]), chosen], axis=-2)[..., segment + 1, :]
            gross = (w * returns).sum(axis=-1)
            before = np.concatenate([np.zeros_like(w[..., :1, :]), w[..., :-1, :]], axis=-2)
            moved = np.abs(w - before)
            return gross - (moved * slip).sum(axis=-1) - (moved > 1e-9).sum(axis=-1) * commission

        actual = value(targets[None])[0]
        distinct = len(decisions) > 0 and any(len(set(np.round(w, 9))) > 1 for _, w in decisions)
        if distinct:
            trials = np.empty((TRIALS, len(returns)))
            for start in range(0, TRIALS, 100):
                count = min(100, TRIALS - start)
                order = np.argsort(rng.random((count, len(decisions), len(symbols))), axis=-1)
                trials[start : start + count] = value(np.take_along_axis(np.broadcast_to(targets, order.shape), order, axis=-1))
            random_versions = trials
        else:
            notes.append("Every decision gave each stock the same weight, so shuffling them changes nothing.")
    else:
        notes.append("This strategy makes no choices to compare with random ones: it holds what it's told to.")

    comparison = None
    if random_versions is not None:
        totals, sharpes = _stats(random_versions)
        actual_total, actual_sharpe = _stats(actual[None])
        counts, edges = np.histogram(totals, bins=BINS)
        comparison = {
            "kind": kind,
            "trials": TRIALS,
            "strategy": {"totalReturn": _n(actual_total[0]), "sharpe": _n(actual_sharpe[0], 4)},
            "randomMedian": {"totalReturn": _n(np.median(totals)), "sharpe": _n(np.nanmedian(sharpes) if np.isfinite(sharpes).any() else None, 4)},
            "percentile": {"totalReturn": _n(_percentile(float(actual_total[0]), totals), 4), "sharpe": _n(_percentile(float(actual_sharpe[0]), sharpes), 4)},
            "histogram": {"edges": [_n(e) for e in edges], "counts": [int(c) for c in counts]},
        }

    return {"comparison": comparison, "sharpeRange": sharpe_range(run, outcome.benchmark, rng), "notes": notes}


def sharpe_range(run: engine.Run, benchmark: engine.Run, rng: np.random.Generator) -> dict[str, Any] | None:
    """A 90% range for the run's Sharpe ratio, and how often it beats the benchmark's, by a paired block bootstrap."""
    a = np.array([v for _, v in run.equity])
    b = np.array([v for _, v in benchmark.equity])
    if len(a) != len(b) or len(a) < 2 * BLOCK + 1:
        return None
    ra, rb = a[1:] / a[:-1] - 1, b[1:] / b[:-1] - 1
    length = len(ra)
    blocks = math.ceil(length / BLOCK)
    offsets = np.arange(BLOCK)
    run_sharpes, benchmark_sharpes = [], []
    for start in range(0, RESAMPLES, 250):
        count = min(250, RESAMPLES - start)
        starts = rng.integers(0, length - BLOCK + 1, size=(count, blocks))
        picks = (starts[:, :, None] + offsets).reshape(count, -1)[:, :length]
        run_sharpes.append(_stats(ra[picks])[1])
        benchmark_sharpes.append(_stats(rb[picks])[1])
    s, bs = np.concatenate(run_sharpes), np.concatenate(benchmark_sharpes)
    usable = np.isfinite(s)
    if usable.sum() < RESAMPLES / 2:
        return None  # the run barely moved (mostly cash): no Sharpe ratio to speak of
    beats = np.where(np.isfinite(bs), s > bs, s > 0)[usable]
    return {
        "sharpe": _n(run.metrics.sharpe, 4),
        "benchmarkSharpe": _n(benchmark.metrics.sharpe, 4),
        "low": _n(np.percentile(s[usable], 5), 4),
        "high": _n(np.percentile(s[usable], 95), 4),
        "chanceAboveBenchmark": _n(float(beats.mean()), 4),
        "resamples": RESAMPLES,
        "block": BLOCK,
    }
