"""The HTTP layer: authentication, validation and limits."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from analytics import api
from main import app

DAY = 86_400_000
T0 = 1_700_000_000_000
TOKEN = "test-token"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    return TestClient(app)


def body(**config_overrides):
    times = [T0 + i * DAY for i in range(60)]
    config = {
        "version": 2,
        "holdings": [{"symbol": "AAPL", "weight": 1}],
        "strategy": {"kind": "moving-average", "fast": 5, "slow": 20},
        "start": times[0],
        "end": times[-1],
        "initialCash": 10_000,
        "costs": {"commission": 0, "slippageBps": 0},
        "benchmark": "same-stocks",
    } | config_overrides
    return {"config": config, "prices": {"AAPL": {"times": times, "prices": [100 + i for i in range(60)]}}}


AUTH = {"Authorization": f"Bearer {TOKEN}"}


def test_health_needs_no_token(client):
    assert client.get("/health").json() == {"status": "ok", "engine": {"name": "python", "version": "1.2.0"}}


def test_runs_a_backtest_and_answers_in_camel_case(client):
    response = client.post("/v1/backtests", json=body(), headers=AUTH)
    assert response.status_code == 200
    data = response.json()
    assert data["engine"] == {"name": "python", "version": "1.2.0"}
    assert set(data["run"]["metrics"]) >= {"finalValue", "totalReturn", "cagr", "maxDrawdown", "sharpe", "exposure"}
    assert len(data["run"]["equity"]) == 60


def test_refuses_a_missing_or_wrong_token(client):
    assert client.post("/v1/backtests", json=body()).status_code == 401
    assert client.post("/v1/backtests", json=body(), headers={"Authorization": "Bearer nope"}).status_code == 401


def test_refuses_everything_when_no_token_is_configured(monkeypatch):
    monkeypatch.delenv("ANALYTICS_SERVICE_TOKEN", raising=False)
    response = TestClient(app).post("/v1/backtests", json=body(), headers=AUTH)
    assert response.status_code == 503


@pytest.mark.parametrize(
    "overrides, problem",
    [
        ({"strategy": {"kind": "moving-average", "fast": 30, "slow": 20}}, "shorter than the long one"),
        ({"strategy": {"kind": "astrology"}}, "strategy"),
        ({"holdings": [{"symbol": "AAPL", "weight": 0.5}]}, "add up to 100%"),
        ({"initialCash": 5}, "initialCash"),
        ({"start": T0 + 100 * DAY}, "start must be before the end"),
    ],
)
def test_explains_invalid_settings(client, overrides, problem):
    response = client.post("/v1/backtests", json=body(**overrides), headers=AUTH)
    assert response.status_code == 422
    assert problem in " ".join(response.json()["problems"])


def test_explains_bad_prices(client):
    data = body()
    data["prices"]["AAPL"]["times"][5] = data["prices"]["AAPL"]["times"][4]  # a duplicate date
    response = client.post("/v1/backtests", json=data, headers=AUTH)
    assert response.status_code == 422
    assert "more than once" in response.json()["error"]


def test_refuses_oversized_requests(client):
    response = client.post("/v1/backtests", content=b"x" * (api.MAX_BODY_BYTES + 1), headers={**AUTH, "content-type": "application/json"})
    assert response.status_code == 413


def test_returns_the_ledger_and_decisions_when_asked(client):
    plain = client.post("/v1/backtests", json=body(), headers=AUTH).json()
    assert plain["run"]["ledger"] is None and plain["warmup"] == "within-period"
    assert plain["assumptions"]["signals"].startswith("Decisions use closes up to the previous trading day")
    data = client.post("/v1/backtests", json=body() | {"includeLedger": True}, headers=AUTH).json()
    ledger, decisions = data["run"]["ledger"], data["run"]["decisions"]
    assert len(ledger) == 60 and set(ledger[0]) == {"time", "cash", "shares", "holdingsValue", "totalValue", "decided"}
    assert [r["totalValue"] for r in ledger] == [p["price"] for p in data["run"]["equity"]]
    assert decisions[0]["basedOn"] == decisions[0]["time"] - DAY


def test_pre_start_warm_up_is_an_option(client):
    data = body(start=T0 + 30 * DAY)
    within = client.post("/v1/backtests", json=data, headers=AUTH).json()
    pre = client.post("/v1/backtests", json=data | {"warmup": "pre-start"}, headers=AUTH).json()
    assert within["run"]["equity"][0]["time"] == pre["run"]["equity"][0]["time"] == T0 + 30 * DAY
    assert pre["run"]["trades"][0]["time"] == T0 + 30 * DAY
    assert within["run"]["trades"][0]["time"] == T0 + 50 * DAY
    assert client.post("/v1/backtests", json=data | {"warmup": "later"}, headers=AUTH).status_code == 422
