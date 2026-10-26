"""The "Was it luck?" check (analytics/luck.py): random versions keep what they should, and skill and luck come out where they should."""

from __future__ import annotations

import math
import time

import numpy as np
import pytest

from analytics import engine, luck

DAY = 86_400_000
T0 = 1_600_000_000_000


def series(symbol: str, prices) -> "engine.pd.Series":
    return engine.to_series(symbol, [T0 + i * DAY for i in range(len(prices))], list(prices))


def walk(seed: int, days: int, drift: float = 0.0003, vol: float = 0.015) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return 100 * np.exp(np.cumsum(rng.normal(drift, vol, days)))


def config(symbols, strategy="moving-average", days=1500, **extra) -> engine.Config:
    values = dict(holdings=[(s, 1 / len(symbols)) for s in symbols], strategy=strategy, start=T0, end=T0 + days * DAY, initial_cash=10_000.0)
    if strategy == "moving-average":
        values.update(fast=20, slow=60)
    values.update(extra)
    return engine.Config(**values)


class TestRandomRuns:
    @pytest.mark.parametrize("seed", range(20))
    def test_keeps_the_number_of_stretches_and_days(self, seed):
        rng = np.random.default_rng(seed)
        held = rng.random(300) < rng.uniform(0.05, 0.95)
        out = luck._random_runs(held, rng)
        stretches = lambda h: int(np.sum(np.diff(np.concatenate([[0], h.astype(int)])) == 1))  # noqa: E731
        assert len(out) == len(held) and out.sum() == held.sum() and stretches(out) == stretches(held)

    def test_all_or_nothing_stays_as_it_is(self):
        rng = np.random.default_rng(0)
        assert not luck._random_runs(np.zeros(50, dtype=bool), rng).any()
        assert luck._random_runs(np.ones(50, dtype=bool), rng).all()


class TestLuck:
    def test_noise_lands_in_the_middle(self):
        """On random walks, a crossover has no edge: on average it beats about half of random timings."""
        percentiles = []
        for seed in range(6):
            prices = {"A": series("A", walk(seed, 1500))}
            result = luck.luck(config(["A"]), prices)
            percentiles.append(result["comparison"]["percentile"]["totalReturn"])
        assert 0.25 < float(np.mean(percentiles)) < 0.75

    def test_real_trends_land_near_the_top(self):
        """Long, smooth up and down swings are what a crossover is built for: it beats nearly every random timing."""
        days = np.arange(1500)
        prices = {"A": series("A", 100 * np.exp(0.4 * np.sin(days / 60) + np.random.default_rng(1).normal(0, 0.002, 1500).cumsum()))}
        result = luck.luck(config(["A"]), prices)
        assert result["comparison"]["kind"] == "timing"
        assert result["comparison"]["percentile"]["totalReturn"] > 0.95

    def test_picking_the_steady_winner_lands_near_the_top(self):
        """One stock rises steadily while the others drift: momentum keeps picking it, which random picks rarely do."""
        prices = {"A": series("A", walk(1, 1500, drift=0.0015, vol=0.01)), "B": series("B", walk(2, 1500, drift=-0.0003)), "C": series("C", walk(3, 1500, drift=-0.0003))}
        result = luck.luck(config(["A", "B", "C"], strategy="momentum-rotation", top=1, lookback_months=3, absolute=False), prices)
        assert result["comparison"]["kind"] == "picking"
        assert result["comparison"]["percentile"]["totalReturn"] > 0.95

    def test_strategies_without_choices_get_only_the_sharpe_range(self):
        result = luck.luck(config(["A"], strategy="buy-and-hold"), {"A": series("A", walk(4, 600))})
        assert result["comparison"] is None and "no choices" in result["notes"][0]
        r = result["sharpeRange"]
        assert r["low"] < r["sharpe"] < r["high"] and 0 <= r["chanceAboveBenchmark"] <= 1

    def test_same_inputs_same_answer(self):
        prices = {"A": series("A", walk(5, 800)), "B": series("B", walk(6, 800))}
        c = config(["A", "B"], days=800)
        assert luck.luck(c, prices) == luck.luck(c, prices)

    def test_histogram_counts_every_random_version(self):
        result = luck.luck(config(["A"]), {"A": series("A", walk(7, 1500))})
        h = result["comparison"]["histogram"]
        assert sum(h["counts"]) == luck.TRIALS and len(h["edges"]) == luck.BINS + 1

    def test_optimised_strategies_are_shuffled(self):
        prices = {s: series(s, walk(10 + i, 1000, vol=0.01 + 0.01 * i)) for i, s in enumerate("ABC")}
        result = luck.luck(config(list("ABC"), strategy="optimised", days=1000, objective="min-variance", frequency="monthly", lookback_months=12), prices)
        assert result["comparison"]["kind"] == "picking" and math.isfinite(result["comparison"]["percentile"]["sharpe"])

    def test_fifteen_years_of_five_stocks_is_quick(self):
        days = 3800
        prices = {s: series(s, walk(20 + i, days)) for i, s in enumerate("ABCDE")}
        began = time.monotonic()
        luck.luck(config(list("ABCDE"), days=days), prices)
        assert time.monotonic() - began < 8
