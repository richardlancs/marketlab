"""The pairs lab (analytics/pairs.py): finding real pairs, not inventing them, and trading the gap honestly."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from analytics import api, pairs
from analytics import db as database
from main import app

DAY = 86_400_000
T0 = 1_600_000_000_000


def closes(values) -> pd.Series:
    return pd.Series(np.asarray(values, dtype=float), index=pd.Index([T0 + i * DAY for i in range(len(values))], dtype=np.int64))


def cointegrated(seed: int, days: int = 600, ratio: float = 1.5, noise: float = 0.02):
    """B wanders; A = ratio × B's log price plus a gap that keeps returning to zero (AR(1), half-life about 3 sessions)."""
    rng = np.random.default_rng(seed)
    log_b = np.log(50) + np.cumsum(rng.normal(0.0003, 0.015, days))
    gap = np.zeros(days)
    for t in range(1, days):
        gap[t] = 0.8 * gap[t - 1] + rng.normal(0, noise)
    return closes(np.exp(1.0 + ratio * log_b + gap)), closes(np.exp(log_b))


def walks(seed: int, count: int, days: int = 600):
    rng = np.random.default_rng(seed)
    return {f"S{i:02d}": closes(100 * np.exp(np.cumsum(rng.normal(0.0003, 0.015, days)))) for i in range(count)}


def test_finds_a_cointegrated_pair_and_its_hedge_ratio():
    a, b = cointegrated(1, noise=0.01)
    result = pairs.scan({"A": a, "B": b, **walks(2, 4)}, {"A": "Tech", "B": "Tech", **{f"S{i:02d}": "Tech" for i in range(4)}}, T0 + 400 * DAY)
    best = result["pairs"][0]
    assert (best["a"], best["b"]) == ("A", "B") and best["adjusted"] < 0.05
    assert best["hedgeRatio"] == pytest.approx(1.5, rel=0.05)
    assert 1.5 < best["halfLife"] < 8


def test_independent_walks_rarely_survive_the_adjustment():
    stocks = walks(3, 16)
    result = pairs.scan(stocks, {s: "Tech" for s in stocks}, T0 + 400 * DAY)
    assert result["tests"] == 16 * 15 // 2
    assert result["passedAdjusted"] <= 0.1 * result["tests"]
    assert result["expectedByChance"] == pytest.approx(0.05 * result["tests"], abs=0.01)


def test_only_same_sector_pairs_are_tested():
    stocks = walks(4, 6)
    result = pairs.scan(stocks, {s: ("Tech" if i < 3 else "Banks") for i, s in enumerate(stocks)}, T0 + 400 * DAY)
    assert result["tests"] == 3 + 3


def test_benjamini_hochberg_matches_the_textbook_example():
    assert pairs.benjamini_hochberg([0.01, 0.04, 0.03, 0.005]) == pytest.approx([0.02, 0.04, 0.04, 0.02])


def test_trades_the_gap_with_formation_numbers_only():
    a, b = cointegrated(5)
    result = pairs.backtest(a, b, T0 + 300 * DAY, names=("A", "B"), commission=1, slippage_bps=5)
    assert len(result["times"]) == 252 and result["times"][0] > T0 + 300 * DAY
    # The z-score uses the formation's mean and spread: recompute it from them.
    f = result["formation"]
    i = 10
    gap = np.log(a.loc[result["times"][i]]) - f["intercept"] - f["hedgeRatio"] * np.log(b.loc[result["times"][i]])
    assert result["z"][i] == pytest.approx((gap - f["mean"]) / f["sd"], abs=0.01)
    assert result["metrics"].trades == len(result["trades"]) > 0
    # A mean-reverting gap, traded after costs, made money.
    assert result["metrics"].total_return > 0


def test_holds_a_long_and_a_short_leg_and_pays_to_borrow():
    a, b = cointegrated(6)
    result = pairs.backtest(a, b, T0 + 300 * DAY, names=("A", "B"), borrow_bps=200)
    first = result["trades"][:2]
    assert {t["symbol"] for t in first} == {"A", "B"} and {t["side"] for t in first} == {"buy", "sell"}
    assert result["costs"]["borrow"] > 0


def test_decides_from_the_previous_close():
    a, b = cointegrated(7)
    result = pairs.backtest(a, b, T0 + 300 * DAY, names=("A", "B"))
    index = {t: i for i, t in enumerate(result["times"])}
    for trade in result["trades"]:
        z_before = result["z"][index[trade["time"]] - 1]
        if trade["reason"].startswith("gap stretched"):
            assert abs(z_before) >= result["settings"]["entry"]


def test_refuses_settings_that_make_no_sense():
    a, b = cointegrated(8)
    with pytest.raises(pairs.PairError):
        pairs.backtest(a, b, T0 + 300 * DAY, entry=2, exit=2.5)
    with pytest.raises(pairs.PairError, match="after"):
        pairs.backtest(a, b, T0 + 595 * DAY)


# --- Through the database and the API ------------------------------------------------------

ROOT = Path(__file__).parents[3]
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def stored(tmp_path, monkeypatch):
    sqlite = database.SqliteDatabase(tmp_path / "test.db")
    for migration in sorted((ROOT / "drizzle").glob("*.sql")):
        for statement in migration.read_text().split("--> statement-breakpoint"):
            if statement.strip():
                sqlite.execute(statement)
    a, b = cointegrated(9)
    rows = [
        ("INSERT INTO daily_bar (source, symbol, time, open, high, low, close, adj_close, volume) VALUES ('mock', ?, ?, ?, ?, ?, ?, ?, NULL)", [symbol, int(t), p, p, p, p, p])
        for symbol, s in {"AAA": a, "BBB": b, **walks(10, 2)}.items()
        for t, p in s.items()
    ]
    sqlite.execute_many(rows)
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    app.dependency_overrides[api.get_database] = lambda: sqlite
    yield sqlite
    app.dependency_overrides.clear()


def test_scans_and_tests_pairs_from_stored_prices(stored):
    client = TestClient(app)
    universe = [{"symbol": "AAA", "sector": "Tech"}, {"symbol": "BBB", "sector": "Tech"}, {"symbol": "S00", "sector": "Tech"}, {"symbol": "S01", "sector": "Banks"}]
    scan = client.post("/v1/pairs/scan", json={"source": "mock", "universe": universe, "formationEnd": T0 + 300 * DAY}, headers=AUTH)
    assert scan.status_code == 200
    result = scan.json()["result"]
    assert result["tests"] == 3 and (result["pairs"][0]["a"], result["pairs"][0]["b"]) == ("AAA", "BBB")

    body = {"source": "mock", "a": "AAA", "b": "BBB", "formationEnd": T0 + 300 * DAY, "costs": {"commission": 1, "slippageBps": 5}}
    test = client.post("/v1/pairs/backtest", json=body, headers=AUTH)
    assert test.status_code == 200
    assert {"totalReturn", "sharpe", "maxDrawdown"} <= set(test.json()["result"]["metrics"])
    assert client.post("/v1/pairs/backtest", json={**body, "b": "AAA"}, headers=AUTH).status_code == 422
    assert client.post("/v1/pairs/backtest", json={**body, "b": "ZZZ"}, headers=AUTH).status_code == 422
