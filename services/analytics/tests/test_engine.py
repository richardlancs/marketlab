"""Unit tests of the engine's rules, on small hand-made series (no web framework involved)."""

from __future__ import annotations

import math

import pytest

from analytics import engine

DAY = 86_400_000
T0 = 1_700_000_000_000


def series(symbol: str, prices: list[float], start: int = 0):
    times = [T0 + (start + i) * DAY for i in range(len(prices))]
    return engine.to_series(symbol, times, prices)


def config(**overrides) -> engine.Config:
    values = dict(holdings=[("AAPL", 1.0)], strategy="buy-and-hold", start=T0, end=T0 + 10_000 * DAY, initial_cash=10_000.0)
    values.update(overrides)
    return engine.Config(**values)


class TestInputs:
    def test_refuses_duplicate_dates(self):
        with pytest.raises(engine.InputError, match="more than once"):
            engine.to_series("AAPL", [T0, T0 + DAY, T0 + DAY], [1.0, 2.0, 3.0])

    def test_refuses_unsorted_dates(self):
        with pytest.raises(engine.InputError, match="in order"):
            engine.to_series("AAPL", [T0 + DAY, T0], [1.0, 2.0])

    @pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf, 0.0, -5.0])
    def test_refuses_prices_that_arent_positive_and_finite(self, bad):
        with pytest.raises(engine.InputError, match="positive, finite"):
            engine.to_series("AAPL", [T0, T0 + DAY], [100.0, bad])

    def test_refuses_mismatched_and_oversized_series(self):
        with pytest.raises(engine.InputError, match="dates but"):
            engine.to_series("AAPL", [T0], [1.0, 2.0])
        with pytest.raises(engine.InputError, match="at most"):
            n = engine.MAX_POINTS + 1
            engine.to_series("AAPL", [T0 + i * DAY for i in range(n)], [1.0] * n)

    def test_aligns_on_shared_days_only(self):
        a = series("A", [1.0, 2.0, 3.0, 4.0])
        b = engine.to_series("B", [T0, T0 + 2 * DAY, T0 + 3 * DAY], [10.0, 30.0, 40.0])  # missing day 1
        times, closes = engine.align({"A": a, "B": b}, T0, T0 + 3 * DAY)
        assert times == [T0, T0 + 2 * DAY, T0 + 3 * DAY]
        assert closes == {"A": [1.0, 3.0, 4.0], "B": [10.0, 30.0, 40.0]}

    def test_refuses_too_little_history(self):
        with pytest.raises(engine.InputError, match="Not enough price history"):
            engine.run_config(config(), {"AAPL": series("AAPL", [100.0])})

    def test_refuses_invalid_windows(self):
        with pytest.raises(engine.InputError, match="shorter than the long"):
            engine.moving_average_crossover({"AAPL": 1.0}, 50, 20)
        with pytest.raises(engine.InputError, match="at least 2"):
            engine.moving_average_crossover({"AAPL": 1.0}, 1, 20)

    def test_needs_the_market_for_a_market_benchmark(self):
        with pytest.raises(engine.InputError, match="market index"):
            engine.run_config(config(benchmark="market"), {"AAPL": series("AAPL", [100.0, 101.0])})


class TestSimulation:
    def test_buy_and_hold_fills_at_the_first_close_with_costs(self):
        outcome = engine.run_config(
            config(costs=engine.Costs(commission=5.0, slippage_bps=10.0)),
            {"AAPL": series("AAPL", [100.0, 110.0])},
        )
        [trade] = outcome.run.trades
        assert trade.price == pytest.approx(100.1)  # 10 bps above the close
        assert trade.shares == pytest.approx((10_000 - 5) / 100.1)  # cash after the commission
        assert outcome.run.equity[-1][1] == pytest.approx(trade.shares * 110)

    def test_never_spends_more_than_the_cash(self):
        outcome = engine.run_config(config(initial_cash=100.0, costs=engine.Costs(commission=100.0)), {"AAPL": series("AAPL", [10.0, 11.0, 12.0])})
        assert outcome.run.trades == []
        assert [v for _, v in outcome.run.equity] == [100.0, 100.0, 100.0]

    def test_signals_never_see_todays_or_later_prices(self):
        """Changing prices from day k on can't change any decision made before day k."""
        prices = [100 + 10 * math.sin(i / 5) for i in range(120)]
        k = 80
        changed = prices[:k] + [p * 3 for p in prices[k:]]
        cfg = config(strategy="moving-average", fast=5, slow=20)
        before = engine.run_config(cfg, {"AAPL": series("AAPL", prices)}).run
        after = engine.run_config(cfg, {"AAPL": series("AAPL", changed)}).run
        early = lambda run: [(t.time, t.side, round(t.shares, 9)) for t in run.trades if t.time < T0 + k * DAY]
        assert early(before) == early(after)
        # ...and day k itself only fills at its own (changed) close, decided on earlier closes.
        decided_on_k = lambda run: [t.side for t in run.trades if t.time == T0 + k * DAY]
        assert decided_on_k(before) == decided_on_k(after)

    def test_crossover_waits_for_the_long_average(self):
        prices = [100.0 + i for i in range(30)]  # rising: an uptrend as soon as it can tell
        run = engine.run_config(config(strategy="moving-average", fast=5, slow=10), {"AAPL": series("AAPL", prices)}).run
        assert run.trades[0].time == T0 + 10 * DAY  # day 10: the first day with 10 known closes

    def test_benchmark_covers_exactly_the_strategys_days(self):
        prices = {"AAPL": series("AAPL", [100.0 + i for i in range(50)])}
        market = series("Market", [1000.0 + i for i in range(60)])
        cfg = config(start=T0 + 5 * DAY, end=T0 + 40 * DAY, benchmark="market")
        outcome = engine.run_config(cfg, prices, market)
        assert [t for t, _ in outcome.benchmark.equity] == [t for t, _ in outcome.run.equity]

    def test_metrics_for_a_steady_line(self):
        equity = [(T0 + i * DAY, 100.0) for i in range(10)]
        m = engine.compute_metrics(equity, 0, 0.0)
        assert (m.total_return, m.max_drawdown, m.volatility, m.sharpe) == (0.0, 0.0, 0.0, None)

    def test_drawdown_is_measured_from_the_running_peak(self):
        equity = [(T0 + i * DAY, v) for i, v in enumerate([100.0, 120.0, 90.0, 110.0, 60.0, 130.0])]
        m = engine.compute_metrics(equity, 0, 1.0)
        assert m.max_drawdown == pytest.approx(0.5)
        assert (m.drawdown_peak, m.drawdown_trough) == (T0 + DAY, T0 + 4 * DAY)
