"""Technical indicators, stock profiles and the stored-analytics job, on hand-made series and a throwaway database."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from analytics import api, db as database, jobs, profiles, store
from analytics import technicals as ta
from main import app

ROOT = Path(__file__).resolve().parents[3]
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
DAY = 86_400_000
T0 = 1_700_000_000_000


def frame(closes, volume=1000.0) -> pd.DataFrame:
    closes = np.asarray(closes, dtype=float)
    index = pd.Index([T0 + i * DAY for i in range(len(closes))], dtype=np.int64)
    return pd.DataFrame({"open": closes, "high": closes * 1.01, "low": closes * 0.99, "close": closes, "adj_close": closes, "volume": volume}, index=index)


def walk(n: int, seed: int, vol=0.01, drift=0.0003) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return np.exp(np.cumsum(rng.normal(drift, vol, n)))


# --- Indicators ----------------------------------------------------------------


class TestTechnicals:
    def test_sma_needs_a_full_window(self):
        s = pd.Series([1.0, 2.0, 3.0, 4.0])
        assert ta.sma(s, 3).isna().tolist()[:2] == [True, True]
        assert ta.sma(s, 3).tolist()[2:] == [2.0, 3.0]

    def test_rsi_is_100_when_it_only_rises_and_low_when_it_only_falls(self):
        assert ta.rsi(pd.Series(np.arange(1.0, 40.0))).iloc[-1] == 100
        assert ta.rsi(pd.Series(np.arange(40.0, 1.0, -1))).iloc[-1] < 1

    def test_rsi_matches_a_hand_calculation(self):
        # Alternating +2, -1: average gain 2/2 = 1, average loss 1/2 = 0.5 per day, so RS = 2 and RSI = 66.67.
        closes = [100.0]
        for i in range(40):
            closes.append(closes[-1] + (2 if i % 2 == 0 else -1))
        assert ta.rsi(pd.Series(closes), 14).iloc[-1] == pytest.approx(66.67, abs=1.5)

    def test_bollinger_percent_b_is_half_on_a_flat_line_with_no_width(self):
        bands = ta.bollinger(pd.Series([10.0] * 25 + [11.0]))
        assert bands["upper"].iloc[-1] > bands["lower"].iloc[-1]
        assert bands["percentB"].iloc[-1] > 1  # a jump above the band

    def test_macd_is_positive_in_an_uptrend(self):
        assert ta.macd(pd.Series(np.linspace(100, 200, 80)))["macd"].iloc[-1] > 0

    def test_atr_of_a_constant_range(self):
        n = 30
        high, low, close = pd.Series([11.0] * n), pd.Series([9.0] * n), pd.Series([10.0] * n)
        assert ta.atr(high, low, close, 14).iloc[-1] == pytest.approx(2.0)


# --- Profiles ------------------------------------------------------------------


class TestProfiles:
    def test_beta_and_correlation_against_the_market(self):
        market = walk(600, 1)
        m_returns = np.diff(market) / market[:-1]
        stock = np.concatenate([[100.0], 100 * np.cumprod(1 + 2 * m_returns)])  # exactly twice the market's daily moves
        p = profiles.stock_profile(frame(stock), frame(market))
        assert p["risk"]["beta1Y"] == pytest.approx(2.0, abs=1e-3)
        assert p["risk"]["correlation1Y"] == pytest.approx(1.0, abs=1e-6)

    def test_drawdown_peak_trough_and_recovery(self):
        closes = [100, 120, 90, 60, 80, 121, 130] + [130] * 30
        d = profiles.max_drawdown(frame(closes)["adj_close"])
        assert d["depth"] == pytest.approx(0.5)
        assert (d["peak"], d["trough"], d["recovered"]) == (T0 + DAY, T0 + 3 * DAY, T0 + 5 * DAY)
        assert d["recoveryDays"] == 2

    def test_value_at_risk_and_expected_shortfall(self):
        p = profiles.stock_profile(frame(walk(400, 3, vol=0.02)), None)
        r = p["risk"]
        assert 0 < r["var95"] <= r["expectedShortfall95"]
        assert r["var95"] == pytest.approx(r["parametricVar95"], rel=0.35)  # close to normal for a normal walk
        assert r["beta1Y"] is None  # no market given
        assert sum(r["histogram"]["counts"]) == 252

    def test_states_and_period_returns(self):
        p = profiles.stock_profile(frame(np.linspace(50, 150, 300)), None)
        t = p["technicals"]
        assert t["states"] == {"trend": "above", "cross": "golden", "lastCross": None, "rsi": "overbought", "macd": "bullish"}
        assert p["returns"]["1M"] == pytest.approx(150 / p_close(np.linspace(50, 150, 300), 21) - 1, abs=1e-6)
        assert p["returns"]["3Y"] is None  # not enough history

    def test_trailing_dividends_from_adjusted_prices(self):
        # A $1 dividend on day 100 (previous close 50), and a 2-for-1 split on day 200: only the dividend counts.
        n = 300
        close = np.full(n, 50.0)
        close[200:] = 25.0
        adj = close.copy()
        adj[:100] *= 1 - 1 / 50
        adj[:200] /= 2
        bars = frame(close)
        bars["adj_close"] = adj
        assert profiles.trailing_dividends(bars) == pytest.approx(1.0)
        p = profiles.stock_profile(bars, None)
        assert p["income"]["dividendYield"] == pytest.approx(1 / 25)
        assert p["returns"]["12-1"] is not None

    def test_refuses_too_little_history(self):
        with pytest.raises(ValueError):
            profiles.stock_profile(frame([1.0] * 10), None)

    def test_everything_is_json_safe(self):
        p = profiles.stock_profile(frame([100.0] * 40), None)  # flat: zero volatility, undefined ratios
        json.dumps(p, allow_nan=False)


def p_close(closes, back):
    return closes[-1 - back]


# --- The job and its endpoint ------------------------------------------------


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


def put_series(db, symbol: str, closes, source="mock"):
    rows = [(source, symbol, T0 + i * DAY, c, c * 1.01, c * 0.99, c, c, 1000.0) for i, c in enumerate(closes)]
    statements = [("DELETE FROM daily_bar WHERE source = ? AND symbol = ?", (source, symbol))]
    statements += [("INSERT INTO daily_bar (source, symbol, time, open, high, low, close, adj_close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", r) for r in rows]
    checksum = hashlib.sha256(json.dumps([list(map(float, closes))]).encode()).hexdigest()
    statements.append(
        ("INSERT INTO price_series (source, symbol, checksum, first_time, last_time, bars, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0) "
         "ON CONFLICT (source, symbol) DO UPDATE SET checksum = excluded.checksum, last_time = excluded.last_time, bars = excluded.bars",
         (source, symbol, checksum, rows[0][2], rows[-1][2], len(rows)))
    )
    db.execute_many(statements)


class TestJob:
    def test_computes_once_then_skips_until_prices_change(self, db):
        put_series(db, "SPX", walk(300, 1) * 4000)
        put_series(db, "AAA", walk(300, 2) * 100)
        first = jobs.run_stock_profiles(db, "mock")
        assert sorted(first.computed) == ["AAA", "SPX"] and first.unchanged == 0
        second = jobs.run_stock_profiles(db, "mock")
        assert second.computed == [] and second.unchanged == 2
        put_series(db, "AAA", walk(301, 2) * 100)  # a new day
        assert jobs.run_stock_profiles(db, "mock").computed == ["AAA"]
        [row] = db.query("SELECT result, version FROM analytics_result WHERE kind = 'stock-profile' AND subject = 'AAA'")
        assert row["version"] == store.ANALYTICS_VERSION
        assert json.loads(row["result"])["sessions"] == 301
        assert json.loads(row["result"])["risk"]["beta1Y"] is not None

    def test_reports_missing_and_failed_symbols_and_respects_the_budget(self, db):
        put_series(db, "SPX", walk(300, 1) * 4000)
        put_series(db, "TINY", [10.0] * 5)
        summary = jobs.run_stock_profiles(db, "mock", ["TINY", "NOPE", "SPX"])
        assert summary.missing == ["NOPE"] and "TINY" in summary.failed and summary.computed == ["SPX"]
        for i in range(30):
            put_series(db, f"S{i}", walk(300, i + 10) * 50)
        partial = jobs.run_stock_profiles(db, "mock", budget_ms=0)
        assert partial.computed == [] and len(partial.remaining) > 0

    def test_endpoint(self, db):
        put_series(db, "SPX", walk(300, 1) * 4000)
        client = TestClient(app)
        assert client.post("/v1/analytics/stock-profiles", json={"source": "mock"}).status_code == 401
        response = client.post("/v1/analytics/stock-profiles", json={"source": "mock", "symbols": ["SPX"]}, headers=AUTH)
        assert response.status_code == 200 and response.json()["computed"] == 1
        assert client.post("/v1/analytics/stock-profiles", json={"source": "other"}, headers=AUTH).status_code == 422


# --- Portfolio ----------------------------------------------------------------

from analytics import portfolio  # noqa: E402


def market_and_stocks():
    market = walk(800, 1, vol=0.011)
    m = np.diff(market) / market[:-1]
    rng = np.random.default_rng(7)
    stocks = {}
    for name, beta in (("AAA", 1.5), ("BBB", 0.6), ("CCC", 1.0)):
        r = beta * m + rng.normal(0, 0.008, len(m))
        stocks[name] = frame(np.concatenate([[100.0], 100 * np.cumprod(1 + r)]))
    return frame(market * 4000), stocks


class TestPortfolio:
    def test_risk_contributions_sum_to_one_and_cash_dampens_risk(self):
        market, stocks = market_and_stocks()
        a = portfolio.portfolio_analysis(stocks, {"AAA": 5000, "BBB": 3000, "CCC": 2000}, 0, {"AAA": "Technology"}, market, "seed")
        assert sum(a["risk"]["riskContribution"]) == pytest.approx(1.0, abs=1e-3)
        assert a["risk"]["diversificationRatio"] > 1
        assert a["risk"]["beta"] == pytest.approx(0.5 * 1.5 + 0.3 * 0.6 + 0.2 * 1.0, abs=0.12)
        with_cash = portfolio.portfolio_analysis(stocks, {"AAA": 5000, "BBB": 3000, "CCC": 2000}, 10_000, {}, market, "seed")
        assert with_cash["cashWeight"] == pytest.approx(0.5)
        assert with_cash["risk"]["volatility"] == pytest.approx(a["risk"]["volatility"] / 2, rel=1e-6)
        assert with_cash["sectors"]["Cash"] == pytest.approx(0.5)

    def test_monte_carlo_is_reproducible_and_ordered(self):
        market, stocks = market_and_stocks()
        one = portfolio.portfolio_analysis(stocks, {"AAA": 1, "BBB": 1}, 0, {}, market, "same")
        two = portfolio.portfolio_analysis(stocks, {"AAA": 1, "BBB": 1}, 0, {}, market, "same")
        assert one["monteCarlo"] == two["monteCarlo"]
        b = one["monteCarlo"]["bands"]
        assert len(b["p50"]) == 120
        assert all(lo <= mid <= hi for lo, mid, hi in zip(b["p5"], b["p50"], b["p95"]))

    def test_optimisers_respect_the_rules(self):
        market, stocks = market_and_stocks()
        opt = portfolio.portfolio_analysis(stocks, {"AAA": 1, "BBB": 1, "CCC": 1}, 0, {}, market, "s")["optimisation"]
        for key in ("minimumVariance", "maximumSharpe", "riskParity"):
            w = opt[key]["weights"]
            assert sum(w) == pytest.approx(1, abs=1e-3) and all(0 <= x <= opt["cap"] + 1e-3 for x in w)
        assert opt["minimumVariance"]["volatility"] <= opt["current"]["volatility"] + 1e-6
        assert opt["maximumSharpe"]["sharpe"] >= opt["current"]["sharpe"] - 1e-3
        vols = [p["volatility"] for p in opt["frontier"]]
        assert vols[0] == pytest.approx(opt["minimumVariance"]["volatility"], rel=1e-3)
        assert vols == sorted(vols) or max(vols) - min(vols) < 1e-6

    def test_stress_tests_replay_drawdowns_and_scale_shocks_by_beta(self):
        market, stocks = market_and_stocks()
        a = portfolio.portfolio_analysis(stocks, {"AAA": 1}, 0, {"AAA": "Technology"}, market, "s")
        hypothetical = {s["name"]: s["portfolio"] for s in a["stress"] if s["kind"] == "hypothetical"}
        assert hypothetical["Market falls 20%"] == pytest.approx(-0.2 * a["risk"]["holdingBeta"][0], abs=1e-6)
        assert hypothetical["Tech sell-off (tech −25%, market −5%)"] < hypothetical["Market falls 10%"]
        assert all(s["portfolio"] < 0 for s in a["stress"] if s["kind"] == "historical")
        assert a["optimisation"] is None  # one stock: nothing to weigh

    def test_drawdown_episodes(self):
        prices = frame([100, 90, 80, 100, 110, 99, 105, 120, 60, 70])["adj_close"]
        episodes = portfolio.drawdown_episodes(prices, 3)
        assert [round(e[2], 3) for e in episodes] == [0.5, 0.2, 0.1]

    def test_refuses_an_empty_portfolio(self):
        market, stocks = market_and_stocks()
        with pytest.raises(ValueError):
            portfolio.portfolio_analysis(stocks, {"AAA": 0}, 100, {}, market, "s")

    def test_endpoint(self, db):
        put_series(db, "SPX", walk(400, 1) * 4000)
        put_series(db, "AAA", walk(400, 2) * 100)
        put_series(db, "BBB", walk(400, 3) * 50)
        client = TestClient(app)
        body = {"source": "mock", "holdings": [{"symbol": "AAA", "value": 1000, "sector": "Technology"}, {"symbol": "BBB", "value": 500}], "cash": 250}
        response = client.post("/v1/analytics/portfolio", json=body, headers=AUTH)
        assert response.status_code == 200
        data = response.json()
        assert data["analysis"]["symbols"] == ["AAA", "BBB"] and data["analysis"]["optimisation"] is not None
        assert client.post("/v1/analytics/portfolio", json={**body, "holdings": [{"symbol": "ZZZ", "value": 10}]}, headers=AUTH).status_code == 422


# --- Walk-forward -----------------------------------------------------------

from analytics import engine as eng, walkforward  # noqa: E402


class TestWalkForward:
    def setup_method(self):
        rng = np.random.default_rng(5)
        n = 1300
        closes = 100 * np.cumprod(1 + rng.normal(0.0004, 0.015, n) + 0.004 * np.sin(np.arange(n) / 40))
        self.times = [T0 + i * DAY for i in range(n)]
        self.prices = {"AAA": eng.to_series("AAA", self.times, closes.tolist())}
        self.config = eng.Config(holdings=[("AAA", 1.0)], strategy="moving-average", fast=20, slow=100, start=self.times[0], end=self.times[-1], initial_cash=10_000.0, costs=eng.Costs(1.0, 5.0))

    def test_folds_tile_the_test_period_without_overlap_or_peeking(self):
        r = walkforward.walk_forward(self.prices, self.config, walkforward.Grid(fast=[10, 20, 30], slow=[60, 100, 150]), 252, 126)
        folds = r["folds"]
        assert len(folds) >= 5 and r["combinations"] == 9
        for a, b in zip(folds, folds[1:]):
            assert a["testEnd"] < b["testStart"]  # no overlap
        for f in folds:
            assert f["trainStart"] < f["testStart"]  # trained only on the past
            assert (f["fast"], f["slow"]) in [(x, y) for x in (10, 20, 30) for y in (60, 100, 150)]
        # The chained curves cover exactly the test sessions, starting from the initial cash.
        assert r["walkForward"]["equity"][0][1] == 10_000.0
        assert {"totalReturn", "maxDrawdown", "sharpe", "finalValue"} <= set(r["walkForward"]["metrics"])
        assert [p[0] for p in r["walkForward"]["equity"]] == [p[0] for p in r["buyAndHold"]["equity"]]

    def test_test_results_dont_depend_on_later_prices(self):
        """Changing prices after a fold's test window can't change that fold's choice or result."""
        grid = walkforward.Grid(fast=[10, 20], slow=[60, 100])
        first = walkforward.walk_forward(self.prices, self.config, grid, 252, 126)["folds"]
        values = self.prices["AAA"].to_numpy().copy()
        cut = self.times.index(first[1]["testEnd"]) + 1
        values[cut:] *= 3
        changed = walkforward.walk_forward({"AAA": eng.to_series("AAA", self.times, values.tolist())}, self.config, grid, 252, 126)["folds"]
        assert changed[:2] == first[:2]

    def test_refuses_impossible_grids_and_ranges(self):
        with pytest.raises(eng.InputError, match="shorter"):
            walkforward.walk_forward(self.prices, self.config, walkforward.Grid(fast=[200], slow=[100]), 252, 126)
        short = eng.Config(**{**self.config.__dict__, "end": self.times[260]})  # 261 sessions: a year's training leaves under 20 to test
        with pytest.raises(eng.InputError, match="too short"):
            walkforward.walk_forward(self.prices, short, walkforward.Grid(fast=[10], slow=[50]), 252, 126)
