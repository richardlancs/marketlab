"""Portfolio snapshots (snapshots.py) and the nightly runner (jobs.run_nightly)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from analytics import api, db as database, jobs, performance, snapshots
from main import app

ROOT = Path(__file__).resolve().parents[3]
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
DAY = 86_400_000
T0 = 1_700_000_000_000
N = 500


@pytest.fixture
def db(tmp_path, monkeypatch):
    sqlite = database.SqliteDatabase(tmp_path / "test.db")
    for migration in sorted((ROOT / "drizzle").glob("*.sql")):
        for statement in migration.read_text().split("--> statement-breakpoint"):
            if statement.strip():
                sqlite.execute(statement)
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    app.dependency_overrides[api.get_database] = lambda: sqlite
    rng = np.random.default_rng(4)
    for i, symbol in enumerate(["SPX", *[f"S{k:02d}" for k in range(12)]]):
        closes = 100 * np.cumprod(1 + rng.normal(0.0004, 0.012, N))
        rows = [("mock", symbol, T0 + d * DAY, c, c, c, c, c, 1000.0) for d, c in enumerate(closes)]
        statements = [("INSERT INTO daily_bar (source, symbol, time, open, high, low, close, adj_close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", r) for r in rows]
        statements.append(("INSERT INTO price_series (source, symbol, checksum, first_time, last_time, bars, market_cap, pe_ratio, updated_at) VALUES ('mock', ?, ?, ?, ?, ?, ?, ?, 0)", (symbol, hashlib.sha256(symbol.encode()).hexdigest(), rows[0][2], rows[-1][2], N, 1e9 * (i + 1), 10 + (i * 5) % 13)))
        sqlite.execute_many(statements)
    latest = T0 + (N - 1) * DAY
    sqlite.execute("INSERT INTO user (id, name, email) VALUES ('u1', 'A', 'a@example.com')")
    sqlite.execute("INSERT INTO portfolio (user_id, cash, created_at, processed_through) VALUES ('u1', 500, ?, ?)", [T0 + 400 * DAY, latest])
    sqlite.execute("INSERT INTO holding (user_id, symbol, shares, average_cost) VALUES ('u1', 'S01', 10, 90)")
    price = sqlite.query("SELECT close FROM daily_bar WHERE symbol = 'S01' AND time = ?", [T0 + 450 * DAY])[0]["close"]
    sqlite.execute("INSERT INTO trade (id, user_id, symbol, side, shares, price, time) VALUES ('t1', 'u1', 'S01', 'buy', 4, ?, ?)", [price, T0 + 450 * DAY + 3_600_000])
    yield sqlite
    app.dependency_overrides.clear()


def test_backfills_from_the_start_then_snapshots_each_close(db):
    first = snapshots.run(db, "mock")
    assert first["backfilled"] == 1 and first["snapshotted"] == 0
    rows = db.query("SELECT time, value, cash FROM portfolio_value WHERE user_id = 'u1' ORDER BY time")
    assert rows[0]["time"] <= T0 + 400 * DAY and rows[-1]["time"] == T0 + (N - 1) * DAY
    # Before the trade: 6 shares and more cash; after it: 10 shares and $500.
    before = next(r for r in rows if r["time"] == T0 + 449 * DAY)
    assert before["cash"] > 500 and rows[-1]["cash"] == 500
    # The same values the Performance tab rebuilds.
    account = {"cash": 500.0, "holdings": [{"symbol": "S01", "shares": 10.0}], "trades": [], "events": []}
    closes = {"S01": [(r["time"], r["close"]) for r in db.query("SELECT time, close FROM daily_bar WHERE symbol = 'S01' ORDER BY time")]}
    assert rows[-1]["value"] == pytest.approx(performance.value_series(account, closes, [rows[-1]["time"]])[0])
    # A run with nothing new does nothing.
    assert snapshots.run(db, "mock") == {"status": "ok", "asOf": T0 + (N - 1) * DAY, "snapshotted": 0, "backfilled": 0, "remaining": 0}


def test_skips_accounts_not_brought_up_to_date(db):
    db.execute("UPDATE portfolio SET processed_through = ?", [T0])
    assert snapshots.run(db, "mock")["backfilled"] == 0


def test_the_runner_does_every_part_and_reports_each(db):
    universe = [f"S{k:02d}" for k in range(12)]
    db.execute("INSERT INTO price_alert (id, user_id, symbol, direction, price, condition, created_at) VALUES ('a1', 'u1', 'S01', 'above', 0, ?, ?)", [json.dumps({"kind": "move", "percent": 0.1}), T0 + 300 * DAY])
    result = jobs.run_nightly(db, "mock", universe, 20_000)
    assert set(result["parts"]) == {"alerts", "snapshots", "profiles", "factors"}
    assert result["parts"]["alerts"]["triggered"] == 1
    assert result["parts"]["snapshots"]["backfilled"] == 1
    assert result["parts"]["factors"]["status"] == "computed"
    assert result["unfinished"] == []
    again = jobs.run_nightly(db, "mock", universe, 20_000)
    assert again["parts"]["factors"] == {"status": "unchanged", "stocks": 0} and again["parts"]["alerts"]["triggered"] == 0


def test_a_failing_part_does_not_stop_the_others(db, monkeypatch):
    from analytics import factors

    def boom(*_args):
        raise RuntimeError("boom")

    monkeypatch.setattr(factors, "refresh", boom)
    result = TestClient(app).post("/v1/jobs/nightly", json={"source": "mock", "universe": [f"S{k:02d}" for k in range(12)]}, headers=AUTH).json()
    assert result["parts"]["factors"] == "failed: boom"
    assert isinstance(result["parts"]["snapshots"], dict)


def test_the_performance_endpoint_uses_stored_values_for_past_closes(db):
    snapshots.run(db, "mock")
    db.execute("UPDATE portfolio_value SET value = 12345 WHERE user_id = 'u1' AND time = ?", [T0 + 460 * DAY])
    index = db.query("SELECT time, close FROM daily_bar WHERE symbol = 'SPX' AND time >= ? ORDER BY time", [T0 + 455 * DAY])
    s01 = db.query("SELECT time, close FROM daily_bar WHERE symbol = 'S01' ORDER BY time")
    body = {
        "account": {"cash": 500, "holdings": [{"symbol": "S01", "shares": 10}], "trades": [{"time": T0 + 450 * DAY + 3_600_000, "symbol": "S01", "side": "buy", "shares": 4, "price": s01[450]["close"]}], "events": []},
        "history": {"S01": {"times": [r["time"] for r in s01], "prices": [r["close"] for r in s01]}},
        "index": {"times": [r["time"] for r in index], "prices": [r["close"] for r in index]},
        "ownerId": "u1",
    }
    data = TestClient(app).post("/v1/portfolio/performance", json=body, headers=AUTH).json()
    assert data["portfolio"][5] == 12345
    body.pop("ownerId")
    assert TestClient(app).post("/v1/portfolio/performance", json=body, headers=AUTH).json()["portfolio"][5] != 12345
