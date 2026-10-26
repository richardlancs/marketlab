"""The goal planner (plan.py)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from analytics import plan

DAY = 86_400_000
T0 = 1_700_000_000_000


def bars(drift=0.0004, vol=0.01, n=800, seed=1):
    rng = np.random.default_rng(seed)
    closes = 100 * np.cumprod(1 + rng.normal(drift, vol, n))
    return pd.DataFrame({"adj_close": closes}, index=pd.Index([T0 + i * DAY for i in range(n)], dtype=np.int64))


BARS = {"A": bars()}


def run(**kw):
    args = {"monthly": 0.0, "years": 10, "target": None, "inflation": False, "seed_text": "x"} | kw
    return plan.plan(BARS, {"A": 10_000.0}, 0.0, **args)


def test_without_contributions_it_is_the_projection_in_dollars():
    p = run()
    assert len(p["months"]) == 120 and p["contributed"] == 0
    assert p["bands"]["p10"][-1] < p["bands"]["p50"][-1] < p["bands"]["p90"][-1]
    assert p["runOutProbability"] == 0 and p["runOutMedianMonths"] is None


def test_contributing_raises_the_chance_of_reaching_a_target():
    without = run(target=40_000)["targetProbability"]
    with_saving = run(target=40_000, monthly=200)["targetProbability"]
    assert with_saving > without
    assert run(monthly=200)["contributed"] == pytest.approx(200 * 120)


def test_withdrawing_more_than_it_earns_runs_out():
    p = run(monthly=-500)
    assert p["runOutProbability"] > 0.9
    assert 10 < p["runOutMedianMonths"] < 40
    assert p["final"]["median"] == 0


def test_inflation_shows_less_in_todays_dollars():
    assert run(inflation=True)["final"]["median"] < run()["final"]["median"]


def test_the_same_plan_gives_the_same_picture():
    assert run(monthly=100) == run(monthly=100)
    assert run(seed_text="y") != run()


def test_cash_only_with_contributions_just_adds_up():
    p = plan.plan({}, {}, 1000.0, monthly=100, years=1, target=None, inflation=False, seed_text="x")
    assert p["final"]["median"] == pytest.approx(2200)


def test_refuses_nothing_to_plan_and_silly_lengths():
    with pytest.raises(ValueError):
        plan.plan({}, {}, 0.0, monthly=0, years=10, target=None, inflation=False, seed_text="x")
    with pytest.raises(ValueError):
        run(years=41)
