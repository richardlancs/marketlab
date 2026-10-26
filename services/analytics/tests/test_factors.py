"""Factor returns and exposures (factors.py), on a made-up universe with a known structure."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from analytics import api, db as database, factors
from main import app

ROOT = Path(__file__).resolve().parents[3]
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
DAY = 86_400_000
T0 = 1_700_000_000_000
N = 700


@pytest.fixture
def db(tmp_path, monkeypatch):
    sqlite = database.SqliteDatabase(tmp_path / "test.db")
    for migration in sorted((ROOT / "drizzle").glob("*.sql")):
        for statement in migration.read_text().split("--> statement-breakpoint"):
            if statement.strip():
                sqlite.execute(statement)
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    app.dependency_overrides[api.get_database] = lambda: sqlite
    yield sqlite
    app.dependency_overrides.clear()


def put(db, symbol: str, closes, market_cap=None, pe=None):
    rows = [("mock", symbol, T0 + i * DAY, c, c, c, c, c, 1000.0) for i, c in enumerate(closes)]
    statements = [("INSERT INTO daily_bar (source, symbol, time, open, high, low, close, adj_close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", r) for r in rows]
    checksum = hashlib.sha256(json.dumps(list(map(float, closes))).encode()).hexdigest()
    statements.append(
        (
            "INSERT INTO price_series (source, symbol, checksum, first_time, last_time, bars, market_cap, pe_ratio, updated_at) VALUES ('mock', ?, ?, ?, ?, ?, ?, ?, 0) "
            "ON CONFLICT (source, symbol) DO UPDATE SET checksum = excluded.checksum",
            (symbol, checksum, rows[0][2], rows[-1][2], len(rows), market_cap, pe),
        )
    )
    db.execute_many(statements)


def universe(db, n_stocks=30, seed=1):
    """A market, plus stocks whose size and value groups get a hidden factor's returns on top of the market's."""
    rng = np.random.default_rng(seed)
    market = rng.normal(0.0004, 0.01, N)
    size = rng.normal(0, 0.006, N)
    value = rng.normal(0, 0.006, N)
    put(db, "SPX", 100 * np.cumprod(1 + market))
    names = []
    for i in range(n_stocks):
        cap = 1e9 * (i + 1)  # S00 smallest
        j = (i * 7) % n_stocks  # a different order for value, so size and value aren't the same stocks
        pe = 5 + j
        small = 1.0 if i < n_stocks * 0.3 else -1.0 if i >= n_stocks * 0.7 else 0.0
        cheap = 1.0 if j < n_stocks * 0.3 else -1.0 if j >= n_stocks * 0.7 else 0.0
        returns = market + 0.5 * small * size + 0.5 * cheap * value + rng.normal(0, 0.008, N)
        name = f"S{i:02d}"
        put(db, name, 50 * np.cumprod(1 + returns), cap, pe)
        names.append(name)
    return names, market


def test_builds_the_factors_and_every_stocks_exposures_once(db):
    names, _ = universe(db)
    first = factors.refresh(db, "mock", names)
    assert first["status"] == "computed" and first["stocks"] == len(names)
    assert factors.refresh(db, "mock", names) == {"status": "unchanged", "stocks": 0}
    table = factors.load_factor_returns(db, "mock")
    assert list(table.columns) == list(factors.FACTORS)
    assert not table.isna().any().any()
    # Momentum needs a year of history before its first sort.
    assert len(table) < N - factors.MOMENTUM_LOOKBACK


def test_small_stocks_load_on_size_and_big_ones_against_it(db):
    names, _ = universe(db)
    factors.refresh(db, "mock", names)
    betas = {s: json.loads(db.query("SELECT result FROM analytics_result WHERE kind = 'stock-factors' AND subject = ?", [s])[0]["result"])["betas"] for s in names}
    small = np.mean([betas[s]["size"] for s in names[:9]])
    big = np.mean([betas[s]["size"] for s in names[-9:]])
    assert small > 0.2 > -0.2 > big
    assert all(0.7 < betas[s]["market"] < 1.3 for s in names)


def test_a_stock_that_doubles_the_market_has_a_market_beta_of_two():
    rng = np.random.default_rng(5)
    index = pd.Index([T0 + i * DAY for i in range(300)], dtype=np.int64)
    f = pd.DataFrame({k: rng.normal(0, 0.01, 300) for k in factors.FACTORS}, index=index)
    stock = 2 * f["market"] + rng.normal(0, 0.0005, 300)
    e = factors.exposures(stock, f)
    assert e["betas"]["market"] == pytest.approx(2, abs=0.02)
    assert abs(e["betas"]["size"]) < 0.05 and e["r2"] > 0.99
    assert e["sessions"] == factors.WINDOW


def test_refuses_too_little_history():
    index = pd.Index([T0 + i * DAY for i in range(50)], dtype=np.int64)
    f = pd.DataFrame({k: np.zeros(50) for k in factors.FACTORS}, index=index)
    with pytest.raises(factors.FactorError, match="at least 120"):
        factors.exposures(pd.Series(np.zeros(50), index=index), f)


def test_a_portfolios_exposures_sit_between_its_holdings(db):
    names, _ = universe(db)
    factors.refresh(db, "mock", names)
    small = factors.portfolio_exposures(db, "mock", [(names[0], 1)])["betas"]["size"]
    big = factors.portfolio_exposures(db, "mock", [(names[-1], 1)])["betas"]["size"]
    mix = factors.portfolio_exposures(db, "mock", [(names[0], 1), (names[-1], 1)])
    assert min(small, big) < mix["betas"]["size"] < max(small, big)
    assert mix["holdings"] == {names[0]: 0.5, names[-1]: 0.5}


def test_the_endpoints(db):
    names, _ = universe(db)
    client = TestClient(app)
    assert client.post("/v1/analytics/portfolio/factors", json={"source": "mock", "holdings": [{"symbol": names[0], "value": 100}]}, headers=AUTH).status_code == 409
    assert client.post("/v1/analytics/factors/refresh", json={"source": "mock", "universe": names}, headers=AUTH).json()["status"] == "computed"
    data = client.post("/v1/analytics/portfolio/factors", json={"source": "mock", "holdings": [{"symbol": names[0], "value": 100}]}, headers=AUTH).json()
    assert set(data["factors"]["betas"]) == set(factors.FACTORS)
