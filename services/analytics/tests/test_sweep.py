"""Parameter sweeps (POST /v1/backtests/sweep) and the overfitting check behind them."""

from __future__ import annotations

import math
import random

import pytest
from fastapi.testclient import TestClient

from analytics import overfitting
from main import app

DAY = 86_400_000
T0 = 1_700_000_000_000
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    return TestClient(app)


def walk(n: int, seed: int) -> list[float]:
    rng = random.Random(seed)
    price, out = 100.0, []
    for _ in range(n):
        price *= 1 + (rng.random() - 0.5) * 0.04
        out.append(round(price, 4))
    return out


TIMES = [T0 + i * DAY for i in range(300)]


def config(fast: int, slow: int) -> dict:
    return {
        "version": 2,
        "holdings": [{"symbol": "A", "weight": 1}],
        "strategy": {"kind": "moving-average", "fast": fast, "slow": slow},
        "start": TIMES[0],
        "end": TIMES[-1],
        "initialCash": 10_000,
        "costs": {"commission": 0, "slippageBps": 0},
        "benchmark": "same-stocks",
    }


def sweep_body(points):
    return {"base": config(10, 50), "points": points, "prices": {"A": {"times": TIMES, "prices": walk(300, 1)}}}


def test_runs_each_point_like_a_single_backtest(client):
    points = [config(f, 50) for f in (5, 10, 20)] + [None]
    data = client.post("/v1/backtests/sweep", json=sweep_body(points), headers=AUTH).json()
    assert len(data["metrics"]) == 4 and data["metrics"][3] is None
    for point, metrics in zip(points[:3], data["metrics"][:3]):
        single = client.post("/v1/backtests", json={"config": point, "prices": sweep_body([])["prices"]}, headers=AUTH).json()
        assert metrics == single["run"]["metrics"]
    assert data["benchmark"]["finalValue"] > 0
    assert data["check"]["trials"] == 3


def test_a_point_that_never_trades_still_has_metrics(client):
    data = client.post("/v1/backtests/sweep", json=sweep_body([config(10, 50), config(200, 250)]), headers=AUTH).json()
    assert data["metrics"][0]["trades"] > 0
    assert data["metrics"][1] is not None


def test_settings_outside_the_limits_are_refused(client):
    # The Next.js server never sends these (it leaves invalid grid points out as null); the service checks anyway.
    assert client.post("/v1/backtests/sweep", json=sweep_body([config(100, 299)]), headers=AUTH).status_code == 422


def test_refuses_too_many_points(client):
    response = client.post("/v1/backtests/sweep", json=sweep_body([config(10, 50)] * 201), headers=AUTH)
    assert response.status_code == 422


class TestSelectionCheck:
    def test_needs_two_tries(self):
        assert overfitting.selection_check([1.0], 500) is None
        assert overfitting.selection_check([1.0, None, float("nan")], 500) is None

    def test_luck_grows_with_the_number_of_tries(self):
        rng = random.Random(3)
        few = overfitting.selection_check([rng.gauss(0, 0.5) for _ in range(5)], 750)
        many = overfitting.selection_check([rng.gauss(0, 0.5) for _ in range(200)], 750)
        assert many["expectedByLuck"] > few["expectedByLuck"] > 0

    def test_a_standout_result_is_likely_real_and_a_crowd_of_equals_is_not(self):
        standout = overfitting.selection_check([0.1, 0.0, -0.1, 0.05, 3.0], 2500)
        crowd = overfitting.selection_check([0.5, 0.52, 0.48, 0.51, 0.49] * 20, 250)
        assert standout["probability"] > 0.95
        assert 0 <= crowd["probability"] <= 1 and math.isfinite(crowd["best"])
