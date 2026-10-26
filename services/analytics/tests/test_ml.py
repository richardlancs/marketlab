"""The machine-learning sandbox (ml.py)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from analytics import api, db as database, ml
from main import app

ROOT = Path(__file__).resolve().parents[3]
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
DAY = 86_400_000
T0 = 1_600_000_000_000
N = 1500


def walk(seed: int, drift=0.0003) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    close = 100 * np.cumprod(1 + rng.normal(drift, 0.015, N))
    volume = rng.uniform(1e6, 2e6, N)
    return pd.DataFrame({"adj_close": close, "volume": volume}, index=pd.Index([T0 + i * DAY for i in range(N)], dtype=np.int64))


BARS = {"A": walk(1), "B": walk(2)}
END = T0 + (N - 1) * DAY
START = END - int(4 * 365.25 * DAY)


def settings(**kw) -> ml.Settings:
    return ml.Settings(**({"symbols": ["A", "B"], "features": list(ml.FEATURES), "model": "logistic", "start": START, "end": END} | kw))


def test_on_random_walks_it_does_not_beat_chance():
    r = ml.run(BARS, settings())
    acc = r["accuracy"]
    # Nothing to learn: the accuracy's interval includes always guessing the most common answer.
    assert acc["low"] <= acc["majority"] + 0.01
    assert acc["samples"] > 1000 and r["folds"] >= 6
    assert r["check"] is None or r["check"]["probability"] < 0.99
    assert len(r["luck"]["accuracies"]) == ml.SHUFFLES
    assert set(r["importance"]) == set(ml.FEATURES) and sum(r["importance"].values()) == pytest.approx(1, abs=1e-3)


def test_it_can_learn_a_real_pattern():
    # A stock whose daily moves carry on strongly (each day 0.8 of the last's, plus noise): next week's direction is learnable.
    rng = np.random.default_rng(3)
    r_ = np.zeros(N)
    for i in range(1, N):
        r_[i] = 0.8 * r_[i - 1] + rng.normal(0, 0.01)
    trending = pd.DataFrame({"adj_close": 100 * np.cumprod(1 + r_), "volume": np.full(N, 1e6)}, index=BARS["A"].index)
    r = ml.run({"T": trending}, settings(symbols=["T"], features=["return1w"]))
    assert r["accuracy"]["accuracy"] > max(r["luck"]["accuracies"]) + 0.05
    assert r["accuracy"]["low"] > r["accuracy"]["majority"]


@pytest.mark.parametrize("model", ["logistic", "random-forest", "gradient-boosting"])
def test_each_model_is_reproducible(model):
    a = ml.run(BARS, settings(model=model))
    assert a == ml.run(BARS, settings(model=model))
    assert ml.compare(a, a)["matches"]


def test_costs_lower_the_return():
    assert ml.run(BARS, settings(cost_bps=50))["strategy"]["totalReturn"] < ml.run(BARS, settings(cost_bps=0))["strategy"]["totalReturn"]


def test_refuses_what_it_cannot_do():
    with pytest.raises(ml.MLError, match="1 to 5"):
        ml.run(BARS, settings(symbols=["A"] * 6))
    with pytest.raises(ml.MLError, match="3 to 10 years"):
        ml.run(BARS, settings(start=END - 365 * DAY))
    with pytest.raises(ml.MLError, match="no stored prices"):
        ml.run(BARS, settings(symbols=["Z"]))


@pytest.fixture
def db(tmp_path, monkeypatch):
    sqlite = database.SqliteDatabase(tmp_path / "test.db")
    for migration in sorted((ROOT / "drizzle").glob("*.sql")):
        for statement in migration.read_text().split("--> statement-breakpoint"):
            if statement.strip():
                sqlite.execute(statement)
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    app.dependency_overrides[api.get_database] = lambda: sqlite
    for symbol, bars in BARS.items():
        rows = [("mock", symbol, int(t), c, c, c, c, c, v) for t, c, v in zip(bars.index, bars["adj_close"], bars["volume"])]
        statements = [("INSERT INTO daily_bar (source, symbol, time, open, high, low, close, adj_close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", r) for r in rows]
        statements.append(("INSERT INTO price_series (source, symbol, checksum, first_time, last_time, bars, updated_at) VALUES ('mock', ?, ?, ?, ?, ?, 0)", (symbol, hashlib.sha256(symbol.encode()).hexdigest(), rows[0][2], rows[-1][2], len(rows))))
        sqlite.execute_many(statements)
    yield sqlite
    app.dependency_overrides.clear()


def body(**kw):
    return {"symbols": ["A", "B"], "features": ["return1w", "rsi", "gap50"], "model": "logistic", "start": START, "end": END} | kw


def test_runs_saves_and_reproduces_through_the_api(db):
    client = TestClient(app)
    ran = client.post("/v1/ml/run", json={"source": "mock", "settings": body()}, headers=AUTH)
    assert ran.status_code == 200 and ran.json()["result"]["provenance"]["dataset"]["simulated"] is True
    db.execute("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('owner-1', 'O', 'o@example.com', 0, 0, 0)")
    run = {"id": "ml-1", "name": "Logistic test", "createdAt": 1}
    saved = client.post("/v1/ml/saved", json={"ownerId": "owner-1", "run": run, "source": "mock", "settings": body()}, headers=AUTH)
    assert saved.status_code == 200 and saved.json()["summary"]["model"] == "logistic"
    assert saved.json()["result"]["accuracy"] == ran.json()["result"]["accuracy"]
    reproduced = client.post("/v1/ml/saved/ml-1/reproduce", json={"ownerId": "owner-1"}, headers=AUTH).json()
    assert reproduced["comparison"]["matches"] is True
    assert client.post("/v1/ml/saved/ml-1/reproduce", json={"ownerId": "someone-else"}, headers=AUTH).status_code == 404


def test_the_api_refuses_unknown_features(db):
    response = TestClient(app).post("/v1/ml/run", json={"source": "mock", "settings": body(features=["horoscope"])}, headers=AUTH)
    assert response.status_code == 422
