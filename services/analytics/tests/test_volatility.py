import math

import numpy as np
import pandas as pd
import pytest

from analytics import volatility as vol


def simulate(n=1500, omega=2e-6, alpha=0.09, beta=0.89, seed=1):
    rng = np.random.default_rng(seed)
    variance = omega / (1 - alpha - beta)
    out = np.empty(n)
    for i in range(n):
        out[i] = math.sqrt(variance) * rng.standard_normal()
        variance = omega + alpha * out[i] ** 2 + beta * variance
    return out


def closes(returns, start=100.0):
    prices = start * np.exp(np.concatenate([[0.0], np.cumsum(returns)]))
    return pd.Series(prices, index=np.arange(len(prices)) * 86_400_000 + 1_600_000_000_000)


def test_variances_follow_the_recursion():
    r = np.array([0.01, -0.02, 0.005])
    v = vol.variances(r, 1e-6, 0.1, 0.8, 4e-4)
    expected = [4e-4]
    for x in r:
        expected.append(1e-6 + 0.1 * x**2 + 0.8 * expected[-1])
    assert v == pytest.approx(expected)


def test_fit_recovers_the_parameters():
    fit = vol.fit_garch(simulate(3000))
    assert fit is not None
    assert fit["alpha"] == pytest.approx(0.09, abs=0.04)
    assert fit["beta"] == pytest.approx(0.89, abs=0.06)
    assert fit["alpha"] + fit["beta"] == pytest.approx(0.98, abs=0.02)


def test_no_clustering_or_too_little_data_gives_no_model():
    rng = np.random.default_rng(3)
    assert vol.fit_garch(rng.normal(0, 0.01, 200)) is None
    result = vol.forecast(closes(rng.normal(0, 0.01, 200)))
    assert result["model"] is None
    assert result["ranges"]["day"]["sd"] == pytest.approx(result["realised21"] / math.sqrt(252), rel=1e-3)


def test_forecast_converges_to_the_long_run_level():
    assert vol.horizon_variance(4e-4, 1e-4, 0.9, 1) == pytest.approx(4e-4)
    long = vol.horizon_variance(4e-4, 1e-4, 0.9, 2000)
    assert long / 2000 == pytest.approx(1e-4, rel=0.02)


def test_forecast_shape_and_ranges():
    result = vol.forecast(closes(simulate(1500)))
    assert result["model"] is not None
    day, week, month = (result["ranges"][k] for k in ("day", "week", "month"))
    assert day["sd"] < week["sd"] < month["sd"]
    assert day["low90"] < day["low68"] < result["price"] < day["high68"] < day["high90"]
    assert [c["sessions"] for c in result["cone"]] == list(vol.CONE_WINDOWS)
    for c in result["cone"]:
        assert c["low"] <= c["median"] <= c["high"]
        assert 0 <= c["percentile"] <= 1


def test_check_covers_about_ninety_percent_and_beats_the_plain_forecast():
    check = vol.check(simulate(2000, seed=7))
    assert check is not None
    assert 0.84 <= check["inside90"] <= 0.96
    assert check["qlike"] <= check["naiveQlike"] + 0.05


def test_check_needs_enough_history():
    assert vol.check(simulate(600)) is None
