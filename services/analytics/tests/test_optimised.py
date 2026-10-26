"""The optimised strategy (strategies.py Optimised): past prices only, valid weights, and least-risk really is less risky."""

from __future__ import annotations

import numpy as np
import pytest

from analytics import engine, optimisation
from analytics.data import align
from analytics.strategies import DecisionContext, History, LookAheadError, Optimised

DAY = 86_400_000
T0 = 1_600_000_000_000


def walk(seed: int, days: int, vol: float, drift: float = 0.0003) -> list[float]:
    rng = np.random.default_rng(seed)
    return list(100 * np.exp(np.cumsum(rng.normal(drift, vol, days))))


def market(days: int = 900) -> dict:
    # A calm stock, a middling one and a wild one, independent of each other.
    return {s: engine.to_series(s, [T0 + i * DAY for i in range(days)], walk(i, days, vol)) for i, (s, vol) in enumerate([("CALM", 0.005), ("MID", 0.015), ("WILD", 0.04)])}


def config(objective: str, **extra) -> engine.Config:
    values = dict(holdings=[("CALM", 1 / 3), ("MID", 1 / 3), ("WILD", 1 / 3)], strategy="optimised", start=T0, end=T0 + 900 * DAY, initial_cash=10_000.0, objective=objective, frequency="monthly", lookback_months=12)
    values.update(extra)
    return engine.Config(**values)


def test_weights_add_up_and_respect_the_cap():
    outcome = engine.run_config(config("max-sharpe"), market())
    cap = optimisation.default_cap(3)
    for decision in outcome.run.decisions:
        weights = list(decision.target.values())
        assert sum(weights) == pytest.approx(1) and all(0 <= w <= cap + 1e-9 for w in weights)


def test_holds_equal_weights_until_there_is_history_to_estimate_from():
    first = engine.run_config(config("min-variance"), market()).run.decisions[0]
    assert all(w == pytest.approx(1 / 3) for w in first.target.values())


def test_least_risk_is_less_risky_than_equal_weights():
    outcome = engine.run_config(config("min-variance"), market())
    assert outcome.run.metrics.volatility < outcome.alternative.metrics.volatility
    # It leans on the calm stock, as far as the cap allows.
    assert outcome.run.decisions[-1].target["CALM"] == pytest.approx(optimisation.default_cap(3), abs=1e-3)


def test_compares_with_equal_weights_on_the_same_days():
    outcome = engine.run_config(config("max-sharpe", frequency="quarterly"), market())
    assert [t for t, _ in outcome.alternative.equity] == [t for t, _ in outcome.run.equity]


def test_two_stocks_can_still_be_weighted_differently():
    prices = {k: v for k, v in market().items() if k != "MID"}
    c = config("min-variance", holdings=[("CALM", 0.5), ("WILD", 0.5)])
    last = engine.run_config(c, prices).run.decisions[-1].target
    assert last["CALM"] > 0.7


def test_never_reads_the_session_it_decides():
    sessions = align(market(), T0, T0 + 900 * DAY)
    strategy = Optimised({"CALM": 0.5, "WILD": 0.5}, "min-variance", "monthly", 12)
    history = History(sessions, 300)
    with pytest.raises(LookAheadError):
        history.close("CALM", 300)
    ctx = DecisionContext(day=0, time=sessions.times[300], first_measured_day=True, history=history, shares={"CALM": 0, "WILD": 0}, cash=10_000)
    assert sum(strategy.decide(ctx).values()) == pytest.approx(1)


def test_needs_two_stocks():
    with pytest.raises(engine.InputError, match="two stocks"):
        engine.run_config(config("min-variance", holdings=[("CALM", 1.0)]), market())
