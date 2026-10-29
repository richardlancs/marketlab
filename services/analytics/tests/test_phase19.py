"""Phase 19: option marks, options and shorts in history, the review and the luck check, and portfolio risk with shorts."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from analytics import luck, option_marks, options, performance, portfolio, review
from main import app
from tests.test_nightly import AUTH, DAY, N, T0, db  # noqa: F401  (the fixture)
from tests.test_review import account, at, flat_history, trade

LATEST = T0 + (N - 1) * DAY


def test_marks_match_the_chain_pricing_and_skip_what_is_current(db):
    expiry = LATEST + 30 * DAY
    db.execute("INSERT INTO option_position (user_id, id, symbol, kind, strike, expiry, contracts, average_premium) VALUES ('u1', 'S01:call:100:x', 'S01', 'call', 100, ?, 2, 3)", [expiry])
    first = option_marks.run(db, "mock")
    assert first["marked"] == 1 and first["remaining"] == 0
    row = db.query("SELECT mark, marked_at, delta FROM option_position WHERE user_id = 'u1'")[0]
    closes = [r["close"] for r in db.query("SELECT close FROM daily_bar WHERE symbol = 'S01' ORDER BY time")]
    expected = options.black_scholes("call", closes[-1], 100, 30 / 365, options.volatility_of(closes), options.RISK_FREE, 0.0)
    assert row["marked_at"] == LATEST and row["mark"] == pytest.approx(expected["price"], abs=1e-4) and row["delta"] == pytest.approx(expected["delta"], abs=1e-4)
    assert option_marks.run(db, "mock")["marked"] == 0
    # The endpoint marks one owner's positions on demand and returns them.
    db.execute("UPDATE option_position SET marked_at = NULL")
    response = TestClient(app).post("/v1/options/marks", json={"source": "mock", "ownerId": "u1"}, headers=AUTH)
    assert response.status_code == 200 and response.json()["marks"][0]["id"] == "S01:call:100:x"


def test_snapshots_value_options_at_their_marks(db):
    from analytics import snapshots

    snapshots.run(db, "mock")
    db.execute("UPDATE portfolio SET processed_through = ? WHERE user_id = 'u1'", [LATEST])
    db.execute("DELETE FROM portfolio_value WHERE time = ?", [LATEST])
    db.execute("INSERT INTO option_position (user_id, id, symbol, kind, strike, expiry, contracts, average_premium, mark, marked_at) VALUES ('u1', 'x', 'S01', 'put', 90, ?, 1, 2, 4.5, ?)", [LATEST + 20 * DAY, LATEST])
    without = performance.value_series({"cash": 500.0, "holdings": [{"symbol": "S01", "shares": 10.0}], "trades": [], "events": []}, {"S01": [(r["time"], r["close"]) for r in db.query("SELECT time, close FROM daily_bar WHERE symbol = 'S01' ORDER BY time")]}, [LATEST])[0]
    snapshots.run(db, "mock")
    value = db.query("SELECT value FROM portfolio_value WHERE user_id = 'u1' AND time = ?", [LATEST])[0]["value"]
    assert value == pytest.approx(without + 450)


def test_history_undoes_option_trades_and_values_them_by_what_they_would_settle_for():
    days = [T0 + d * DAY for d in range(5)]
    history = {"A": [(t, 100.0 + 5 * i) for i, t in enumerate(days)]}
    opt = {"kind": "call", "strike": 100.0, "expiry": T0 + 30 * DAY}
    acct = {
        "cash": 1000.0 - 2 * 100 * 3.0,
        "holdings": [],
        "trades": [{"time": days[1] + 60_000, "symbol": "A", "side": "buy", "shares": 2, "price": 3.0, "option": opt}],
        "events": [],
        "options": [{"symbol": "A", **opt, "contracts": 2, "mark": 22.0}],
    }
    values = performance.value_series(acct, history, days)
    # Before the trade: all cash. Then at what the calls would settle for (close − 100), and at the mark on the last day.
    assert values[0] == pytest.approx(1000)
    assert values[2] == pytest.approx(400 + 2 * 100 * 10)
    assert values[-1] == pytest.approx(400 + 2 * 100 * 22)


def test_a_short_is_a_round_trip_that_gains_when_the_price_falls():
    trades = [trade(1, "AAA", "sell", 10, 100), trade(5, "AAA", "buy", 4, 80, gain=80), trade(9, "AAA", "buy", 6, 110, gain=-60)]
    a = account(trades, [])
    r = review.round_trips(a, flat_history(["AAA"]), at(150))
    assert [(t["side"], t["shares"], t["gain"], round(t["return"], 4)) for t in r["closed"]] == [("short", 4, 80, 0.2), ("short", 6, -60, -0.1)]
    assert r["sales"] == [] and r["sellDays"] == 0  # opening a short isn't selling shares owned


def test_an_open_short_and_a_written_option():
    expiry = at(60)
    trades = [
        trade(1, "AAA", "sell", 10, 100),
        {"time": at(2), "symbol": "BBB", "side": "sell", "shares": 1, "price": 2.0, "option": {"kind": "put", "strike": 90, "expiry": expiry}},
        {"time": at(60), "symbol": "BBB", "side": "buy", "shares": 1, "price": 0.0, "realizedGain": 200, "option": {"kind": "put", "strike": 90, "expiry": expiry}},
    ]
    a = account(trades, [{"symbol": "AAA", "shares": -10, "averageCost": 100}])
    history = {"AAA": [(at(d) - 300_000, 90.0) for d in range(200)], "BBB": [(at(d) - 300_000, 100.0) for d in range(200)]}
    r = review.round_trips(a, history, at(150))
    assert r["open"] == [{"symbol": "AAA", "entry": at(1), "shares": 10, "entryPrice": 100, "price": 90, "gain": 100, "return": 0.1, "reason": None, "side": "short"}]
    put = r["closed"][0]
    assert put["option"]["kind"] == "put" and put["side"] == "short" and put["gain"] == 200


def test_stops_reports_what_stocks_did_after_a_stop_sold_them():
    series = pd.Series(np.linspace(100, 160, 200), index=[at(d) - 300_000 for d in range(200)])
    trades = [trade(1, "AAA", "buy", 10, 100), {**trade(5, "AAA", "sell", 10, 95, gain=-50), "id": "stop-1"}]
    a = account(trades, [])
    out = review.review(a, flat_history(["AAA"]), {"AAA": series}, [(at(d) - 300_000, 4000.0) for d in range(200)], None, ["stop-1"])
    assert out["stops"]["summary"]["21"]["sales"] == 1 and out["stops"]["summary"]["21"]["average"] > 0
    assert review.review(a, flat_history(["AAA"]), {"AAA": series}, [(at(d) - 300_000, 4000.0) for d in range(200)], None)["stops"] is None


def test_the_luck_check_flips_shorts_and_leaves_options_out():
    times = [T0 + d * DAY for d in range(120)]
    falling = pd.Series(np.linspace(100, 50, 120), index=times)
    rising = pd.Series(np.linspace(50, 100, 120), index=times)
    trips = [{"symbol": "DOWN", "entry": times[i * 10], "exit": times[i * 10 + 9], "shares": 1, "entryPrice": float(falling.iloc[i * 10]), "side": "short"} for i in range(6)]
    trips.append({"symbol": "DOWN", "entry": times[0], "exit": times[5], "shares": 1, "entryPrice": 1.0, "option": {"kind": "put"}})
    out = luck.account_luck(trips, {"DOWN": falling, "UP": rising}, ["DOWN", "UP"], times, None, None, "seed")
    assert out["trips"] == 6 and any("Option" in n for n in out["notes"])
    assert out["picking"]["strategy"]["totalReturn"] > 0  # shorting a falling stock made money
    assert out["picking"]["percentile"]["totalReturn"] > 0.4  # and beat random picks shorted the same way, about half of which rise


def test_portfolio_risk_counts_a_short_as_a_negative_weight():
    rng = np.random.default_rng(1)
    idx = list(range(T0, T0 + 300 * DAY, DAY))
    bars = {s: pd.DataFrame({"adj_close": 100 * np.cumprod(1 + rng.normal(0, 0.01, 300)), "close": 100.0}, index=idx) for s in ["A", "B", "C"]}
    out = portfolio.portfolio_analysis(bars, {"A": 5000, "B": 3000, "C": -2000}, 9000, {}, None, "x")
    assert out["weights"][2] < 0 and out["cashWeight"] > 0.5
    assert out["optimisation"]["symbols"] == ["A", "B"]
