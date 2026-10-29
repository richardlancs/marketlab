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

An account's own trading (account_luck, the portfolio's Review tab) is
compared the same way, one round trip (review.py) at a time, valued simply
as the money put in times the stock's adjusted return while held:

- Timing: each round trip keeps its stock and how many sessions it was
  held, at random dates since the account's first trade.
- Picking: each keeps its dates and money, in a random stock from the
  catalog that had prices on both days.

The measure is the return on the money traded: all round trips' gains over
all the money they put in. Round trips from the starting holdings (no entry
date) are left out. The Sharpe range uses the account's daily values.
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
    return sharpe_range_of(np.array([v for _, v in run.equity]), np.array([v for _, v in benchmark.equity]), run.metrics.sharpe, benchmark.metrics.sharpe, rng)


def sharpe_range_of(a: np.ndarray, b: np.ndarray, sharpe: float | None, benchmark_sharpe: float | None, rng: np.random.Generator) -> dict[str, Any] | None:
    """sharpe_range for two daily value series on the same days."""
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
        "sharpe": _n(sharpe, 4),
        "benchmarkSharpe": _n(benchmark_sharpe, 4),
        "low": _n(np.percentile(s[usable], 5), 4),
        "high": _n(np.percentile(s[usable], 95), 4),
        "chanceAboveBenchmark": _n(float(beats.mean()), 4),
        "resamples": RESAMPLES,
        "block": BLOCK,
    }


MIN_TRIPS = 5
MIN_SESSIONS = 60


def _comparison(kind: str, actual: float, totals: np.ndarray) -> dict[str, Any]:
    counts, edges = np.histogram(totals, bins=BINS)
    return {
        "kind": kind,
        "trials": TRIALS,
        "strategy": {"totalReturn": _n(actual), "sharpe": None},
        "randomMedian": {"totalReturn": _n(np.median(totals)), "sharpe": None},
        "percentile": {"totalReturn": _n(_percentile(actual, totals), 4), "sharpe": None},
        "histogram": {"edges": [_n(e) for e in edges], "counts": [int(c) for c in counts]},
    }


def account_luck(
    trips: list[Mapping[str, Any]],
    adjusted: Mapping[str, pd.Series],
    universe: list[str],
    times: list[int],
    values: np.ndarray | None,
    index_values: np.ndarray | None,
    seed_text: str,
) -> dict[str, Any]:
    """
    `trips`: round trips with an entry (closed, or open with exit None = still
    held), each with symbol, entry, exit, shares and entryPrice. A short's
    (side "short") gains when the price falls, and so do its random versions;
    options are left out. `times`: the
    sessions since the first trade. `values` and `index_values`: the account's
    and the index's daily values on those sessions, for the Sharpe range.
    """
    from bisect import bisect_right

    rng = np.random.default_rng(int(hashlib.sha256(seed_text.encode()).hexdigest()[:16], 16))
    notes: list[str] = []
    if any(t.get("option") for t in trips):
        notes.append("Option trades aren't included: only trades in shares are compared.")
        trips = [t for t in trips if not t.get("option")]
    symbols = sorted(set(universe) | {t["symbol"] for t in trips})
    column = {s: i for i, s in enumerate(symbols)}
    # Sessions × stocks, carried forward over gaps, NaN before a stock's first price.
    grid = np.array([adjusted[s].reindex(times, method="ffill").to_numpy(dtype=float) if s in adjusted else np.full(len(times), np.nan) for s in symbols]).T
    session = lambda moment: max(0, bisect_right(times, moment) - 1)  # noqa: E731

    usable = []
    for t in trips:
        if t.get("entry") is None:
            continue
        a, b = session(t["entry"]), session(t["exit"]) if t.get("exit") is not None else len(times) - 1
        j = column[t["symbol"]]
        if np.isfinite(grid[a, j]) and np.isfinite(grid[b, j]) and grid[a, j] > 0:
            usable.append((j, a, b, float(t["shares"]) * float(t["entryPrice"]), -1.0 if t.get("side") == "short" else 1.0))
    timing = picking = None
    if len(times) < MIN_SESSIONS:
        notes.append(f"Your account needs at least {MIN_SESSIONS} sessions of trading history to compare; keep going.")
    elif len(usable) < MIN_TRIPS:
        notes.append(f"Trade a bit more first: this needs at least {MIN_TRIPS} completed or open trades with a known start, and has {len(usable)}.")
    else:
        money = np.array([u[3] for u in usable])
        total_money = money.sum()
        actual = sum(m * d * (grid[b, j] / grid[a, j] - 1) for j, a, b, m, d in usable) / total_money
        # Timing: same stock and length, random start (on or after the stock's first price).
        gains = np.zeros(TRIALS)
        for j, a, b, m, d in usable:
            length = b - a
            column_prices = grid[:, j]
            first = int(np.argmax(np.isfinite(column_prices)))
            latest = len(times) - 1 - length
            starts = rng.integers(first, max(first, latest) + 1, size=TRIALS)
            gains += m * d * (column_prices[np.minimum(starts + length, len(times) - 1)] / column_prices[starts] - 1)
        timing = _comparison("timing", float(actual), gains / total_money)
        # Picking: same days and money, a random stock with prices on both days.
        gains = np.zeros(TRIALS)
        for j, a, b, m, d in usable:
            valid = np.nonzero(np.isfinite(grid[a]) & np.isfinite(grid[b]) & (grid[a] > 0))[0]
            chosen = rng.choice(valid, size=TRIALS)
            gains += m * d * (grid[b, chosen] / grid[a, chosen] - 1)
        picking = _comparison("picking", float(actual), gains / total_money)

    sharpe = None
    if values is not None and index_values is not None and len(values) >= MIN_SESSIONS:
        returns = np.stack([values[1:] / values[:-1] - 1, index_values[1:] / index_values[:-1] - 1])
        own, bench = _stats(returns)[1]
        sharpe = sharpe_range_of(values, index_values, None if not math.isfinite(own) else float(own), None if not math.isfinite(bench) else float(bench), rng)
    return {"timing": timing, "picking": picking, "sharpeRange": sharpe, "notes": notes, "trips": len(usable)}
