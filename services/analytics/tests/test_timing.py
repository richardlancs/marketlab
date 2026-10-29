"""
The timing rule and the components behind it: a decision for session D uses
sessions through D-1 only, fills at D's close, and is valued at D's close.
"""

from __future__ import annotations

import math
import random

import pytest

from analytics import engine
from analytics.accounting import Portfolio
from analytics.data import Sessions, align
from analytics.execution import Costs, buy, execute_target, sell
from analytics.indicators import sma_through_previous
from analytics.strategies import DecisionContext, History, LookAheadError, MovingAverageCrossover

DAY = 86_400_000
T0 = 1_700_000_000_000


def times_for(n: int, start: int = 0) -> list[int]:
    return [T0 + (start + i) * DAY for i in range(n)]


def series(symbol: str, prices: list[float], start: int = 0):
    return engine.to_series(symbol, times_for(len(prices), start), prices)


def config(**overrides) -> engine.Config:
    values = dict(holdings=[("AAPL", 1.0)], strategy="moving-average", fast=5, slow=20, start=T0, end=T0 + 10_000 * DAY, initial_cash=10_000.0)
    values.update(overrides)
    return engine.Config(**values)


def wavy(n: int, seed: int = 1) -> list[float]:
    """A random walk with swings, so a crossover trades several times."""
    rng = random.Random(seed)
    price, out = 100.0, []
    for i in range(n):
        price *= 1 + 0.02 * math.sin(i / 7) + rng.uniform(-0.01, 0.01)
        out.append(price)
    return out


def books(run: engine.Run, through: int):
    """Everything recorded for sessions up to and including `through` (a time)."""
    return (
        [p for p in run.equity if p[0] <= through],
        [t for t in run.trades if t.time <= through],
        [r for r in run.ledger if r.time <= through],
        [d for d in run.decisions if d.time <= through],
    )


# ---------------------------------------------------------------------------
# No look-ahead
# ---------------------------------------------------------------------------


class TestNoLookAhead:
    @pytest.mark.parametrize("d", [25, 60, 99, 140])
    def test_changing_prices_after_d_changes_nothing_through_d(self, d):
        prices = wavy(160)
        changed = prices[: d + 1] + [p * random.Random(d).uniform(0.3, 3.0) for p in prices[d + 1 :]]
        before = engine.run_config(config(), {"AAPL": series("AAPL", prices)}).run
        after = engine.run_config(config(), {"AAPL": series("AAPL", changed)}).run
        assert books(before, T0 + d * DAY) == books(after, T0 + d * DAY)

    def test_changing_session_ds_price_doesnt_change_ds_decision(self):
        prices = wavy(160)
        run = engine.run_config(config(), {"AAPL": series("AAPL", prices)}).run
        d = (run.trades[2].time - T0) // DAY  # a session where the strategy decided and traded
        for factor in (0.2, 5.0):
            changed = prices[:d] + [prices[d] * factor] + prices[d + 1 :]
            other = engine.run_config(config(), {"AAPL": series("AAPL", changed)}).run
            [ours] = [x for x in run.decisions if x.time == T0 + d * DAY]
            [theirs] = [x for x in other.decisions if x.time == T0 + d * DAY]
            assert ours == theirs  # the same target, from the same sessions
            # ...but it filled at the changed close: execution and valuation use D's price.
            [t1] = [t for t in run.trades if t.time == T0 + d * DAY]
            [t2] = [t for t in other.trades if t.time == T0 + d * DAY]
            assert t2.price == pytest.approx(t1.price * factor)

    def test_a_signal_from_ds_close_trades_at_the_next_session(self):
        # Flat at 10, then a jump at session 6. Through session 5's close the averages are equal (cash);
        # session 6's close of 20 lifts the short average above the long one, which is first known on session 7.
        prices = [10.0] * 6 + [20.0] * 4
        run = engine.run_config(config(fast=2, slow=4), {"AAPL": series("AAPL", prices)}).run
        [first] = run.trades
        assert first.time == T0 + 7 * DAY
        assert first.price == 20.0
        assert run.decisions[0].based_on == T0 + 6 * DAY  # decided on session 6's close, filled at session 7's

    def test_equal_averages_mean_cash(self):
        run = engine.run_config(config(fast=2, slow=4), {"AAPL": series("AAPL", [10.0] * 30)}).run
        assert run.trades == [] and run.decisions == []
        assert all(r.shares["AAPL"] == 0 for r in run.ledger)

    @pytest.mark.parametrize("cutoff", [21, 50, 77, 120])
    def test_a_run_truncated_at_a_cutoff_matches_the_full_run_through_it(self, cutoff):
        prices = {"AAPL": series("AAPL", wavy(150))}
        full = engine.run_config(config(), prices).run
        cut = engine.run_config(config(end=T0 + cutoff * DAY), prices).run
        assert books(full, T0 + cutoff * DAY) == books(cut, T0 + cutoff * DAY)
        assert cut.equity[-1][0] == T0 + cutoff * DAY

    def test_the_history_view_refuses_the_session_being_decided(self):
        sessions = Sessions(times=tuple(times_for(5)), closes={"A": (1.0, 2.0, 3.0, 4.0, 5.0)})
        history = History(sessions, 3)
        assert len(history) == 3
        assert history.closes("A") == (1.0, 2.0, 3.0)
        assert history.close("A", -1) == 3.0
        assert history.last("A", 10) == (1.0, 2.0, 3.0)
        with pytest.raises(LookAheadError):
            history.close("A", 3)
        with pytest.raises(LookAheadError):
            history.close("A", 4)

    def test_a_strategy_that_peeks_is_stopped(self):
        class Peeker:
            name = "peeker"

            def indicators(self, sessions):
                return {}

            def decide(self, ctx: DecisionContext):
                ctx.history.close("AAPL", ctx.history.__len__())  # today's close: not allowed
                return None

        with pytest.raises(LookAheadError):
            engine.run_backtest({"AAPL": series("AAPL", [1.0, 2.0, 3.0])}, Peeker(), start=T0, end=T0 + 9 * DAY, initial_cash=100.0, costs=Costs())

    def test_strategies_get_no_price_from_the_session_they_decide(self):
        seen = []

        class Recorder:
            name = "recorder"

            def indicators(self, sessions):
                return {}

            def decide(self, ctx: DecisionContext):
                seen.append((ctx.time, ctx.history.times[-1] if len(ctx.history) else None, ctx.history.closes("AAPL")))
                return None

        engine.run_backtest({"AAPL": series("AAPL", [1.0, 2.0, 3.0])}, Recorder(), start=T0, end=T0 + 9 * DAY, initial_cash=100.0, costs=Costs())
        assert seen == [(T0, None, ()), (T0 + DAY, T0, (1.0,)), (T0 + 2 * DAY, T0 + DAY, (1.0, 2.0))]


# ---------------------------------------------------------------------------
# Indicators and warm-up
# ---------------------------------------------------------------------------


class TestIndicatorsAndWarmUp:
    def test_the_average_at_d_ends_at_d_minus_1(self):
        assert sma_through_previous([1.0, 2.0, 3.0, 4.0, 5.0], 2) == [None, None, 1.5, 2.5, 3.5]

    def test_no_average_from_fewer_sessions_than_its_window(self):
        assert sma_through_previous([1.0, 2.0], 3) == [None, None]

    def test_defaults_are_50_and_200(self):
        strategy = MovingAverageCrossover({"AAPL": 1.0})
        assert (strategy.fast, strategy.slow) == (50, 200)

    @pytest.mark.parametrize("fast, slow", [(1, 20), (20, 20), (30, 20), (2.5, 20)])
    def test_invalid_windows_are_refused(self, fast, slow):
        with pytest.raises(engine.InputError):
            MovingAverageCrossover({"AAPL": 1.0}, fast, slow)

    def test_within_period_warm_up_holds_cash_for_the_first_slow_sessions(self):
        run = engine.run_config(config(fast=5, slow=20), {"AAPL": series("AAPL", [100.0 + i for i in range(40)])}).run
        assert run.trades[0].time == T0 + 20 * DAY
        assert all(r.total_value == 10_000.0 for r in run.ledger[:20])

    def test_too_little_history_is_explained(self):
        outcome = engine.run_config(config(fast=5, slow=20), {"AAPL": series("AAPL", [100.0 + i for i in range(15)])})
        assert outcome.run.trades == []
        assert "never traded" in outcome.warnings[0]

    def test_pre_start_warm_up_uses_earlier_sessions_without_measuring_them(self):
        prices = {"AAPL": series("AAPL", [100.0 + i for i in range(80)])}
        start = T0 + 30 * DAY
        within = engine.run_config(config(start=start), prices)
        pre = engine.run_config(config(start=start, warmup="pre-start"), prices)
        # Measured from the start date either way; the benchmark too.
        assert pre.run.equity[0][0] == within.run.equity[0][0] == start
        assert [t for t, _ in pre.benchmark.equity] == [t for t, _ in pre.run.equity]
        assert pre.run.equity[0][1] == 10_000.0
        # With 20 earlier sessions it can act on the first measured one; within the period it waits 20.
        assert pre.run.trades[0].time == start
        assert within.run.trades[0].time == start + 20 * DAY
        assert pre.warnings == []

    def test_pre_start_warm_up_says_when_there_wasnt_enough_earlier_history(self):
        prices = {"AAPL": series("AAPL", [100.0 + i for i in range(80)])}
        start = T0 + 8 * DAY
        outcome = engine.run_config(config(start=start, warmup="pre-start"), prices)
        assert "Only 8 sessions" in outcome.warnings[0]
        assert outcome.run.trades[0].time == start + 12 * DAY

    def test_an_unknown_warm_up_is_refused(self):
        with pytest.raises(engine.InputError, match="warm-up"):
            engine.run_config(config(warmup="sometimes"), {"AAPL": series("AAPL", [1.0, 2.0])})


# ---------------------------------------------------------------------------
# Data: missing prices and duplicates
# ---------------------------------------------------------------------------


class TestData:
    def test_a_missing_price_is_refused_not_filled(self):
        with pytest.raises(engine.InputError, match="missing"):
            engine.to_series("AAPL", times_for(3), [1.0, None, 3.0])

    def test_duplicate_dates_are_refused(self):
        with pytest.raises(engine.InputError, match="more than once"):
            engine.to_series("AAPL", [T0, T0, T0 + DAY], [1.0, 1.0, 2.0])

    def test_a_day_one_stock_lacks_is_skipped_for_all(self):
        a = series("A", [1.0, 2.0, 3.0, 4.0])
        b = engine.to_series("B", [T0, T0 + DAY, T0 + 3 * DAY], [10.0, 20.0, 40.0])
        sessions = align({"A": a, "B": b}, T0, T0 + 3 * DAY)
        assert sessions.times == (T0, T0 + DAY, T0 + 3 * DAY)
        # "Previous session" is the previous day with prices, not the previous calendar day.
        assert History(sessions, 2).close("A", -1) == 2.0

    def test_history_before_the_start_is_only_what_exists(self):
        a = series("A", [1.0, 2.0, 3.0, 4.0, 5.0])
        sessions = align({"A": a}, T0 + 2 * DAY, T0 + 4 * DAY, history_before=10)
        assert (sessions.first_measured, sessions.closes["A"]) == (2, (1.0, 2.0, 3.0, 4.0, 5.0))


# ---------------------------------------------------------------------------
# Execution and costs
# ---------------------------------------------------------------------------


class TestExecutionAndCosts:
    def test_buy_pays_slippage_above_the_close_and_a_commission(self):
        p = Portfolio.starting(1_000.0, ["A"])
        trade = buy(p, T0, "A", 1_000.0, 50.0, Costs(commission=2.0, slippage_bps=20.0))
        assert trade.price == pytest.approx(50.1)
        assert trade.shares == pytest.approx(998.0 / 50.1)  # spends what's left after the commission
        assert p.cash == pytest.approx(0.0)

    def test_sell_receives_slippage_below_the_close_less_a_commission(self):
        p = Portfolio(cash=0.0, shares={"A": 10.0})
        trade = sell(p, T0, "A", 1e9, 50.0, Costs(commission=2.0, slippage_bps=20.0))
        assert trade.shares == 10.0  # never more than held
        assert trade.price == pytest.approx(49.9)
        assert p.cash == pytest.approx(10 * 49.9 - 2.0)

    def test_selling_out_leaves_no_sliver(self):
        # 1000 / 102 shares x 112 / 112 comes out a hair under 1000 / 102.
        p = Portfolio(cash=0.0, shares={"A": 1000 / 102})
        assert (1000 / 102 * 112) / 112 < 1000 / 102
        execute_target(p, {"A": 0.0}, {"A": 112.0}, T0, Costs())
        assert p.shares["A"] == 0.0

    def test_a_crossover_buys_back_in_after_selling_out(self):
        prices = [100.0] * 10 + [101, 102, 110, 120, 132, 132, 122, 112, 112, 112, 112, 112, 117, 122, 127, 132]
        run = engine.run_config(config(fast=2, slow=5, initial_cash=1000.0), {"AAPL": series("AAPL", prices)}).run
        assert [(t.side, t.price) for t in run.trades] == [("buy", 102), ("sell", 112), ("buy", 122)]
        assert run.metrics.exposure == pytest.approx(sum(r.holdings_value > 0 for r in run.ledger) / len(run.ledger))

    def test_tiny_trades_are_skipped(self):
        p = Portfolio.starting(100.0, ["A"])
        assert buy(p, T0, "A", 0.5, 10.0, Costs()) is None
        assert p.cash == 100.0

    def test_sells_fill_before_buys(self):
        p = Portfolio(cash=0.0, shares={"A": 10.0, "B": 0.0})
        trades = execute_target(p, {"B": 1.0}, {"A": 10.0, "B": 5.0}, T0, Costs())
        assert [(t.symbol, t.side) for t in trades] == [("A", "sell"), ("B", "buy")]
        assert p.shares["B"] == pytest.approx(20.0)

    def test_a_round_trip_loses_exactly_its_costs(self):
        costs = Costs(commission=1.0, slippage_bps=10.0)
        prices = [10.0] * 6 + [20.0] * 4 + [10.0] * 6
        run = engine.run_config(config(fast=2, slow=4, costs=costs), {"AAPL": series("AAPL", prices)}).run
        bought, sold = run.trades[:2]
        assert (bought.side, sold.side) == ("buy", "sell")
        assert bought.price == pytest.approx(20.0 * 1.001)
        assert sold.price == pytest.approx(10.0 * 0.999)
        expected_cash = (10_000 - 1.0) / (20.0 * 1.001) * sold.price - 1.0
        assert run.ledger[(sold.time - T0) // DAY].cash == pytest.approx(expected_cash)


# ---------------------------------------------------------------------------
# The ledger
# ---------------------------------------------------------------------------


class TestLedger:
    def test_every_session_balances(self):
        prices = {"A": series("A", wavy(120, 3)), "B": series("B", wavy(120, 4))}
        cfg = config(holdings=[("A", 0.6), ("B", 0.4)], costs=Costs(commission=1.0, slippage_bps=5.0))
        run = engine.run_config(cfg, prices).run
        closes = {s: dict(zip(times_for(120), wavy(120, seed))) for s, seed in (("A", 3), ("B", 4))}
        assert [r.time for r in run.ledger] == [t for t, _ in run.equity]
        for r, (_, value) in zip(run.ledger, run.equity):
            held = r.shares["A"] * closes["A"][r.time] + r.shares["B"] * closes["B"][r.time]
            assert r.holdings_value == pytest.approx(held)
            assert r.total_value == pytest.approx(r.cash + held) == pytest.approx(value)
            assert r.cash >= -1e-9

    def test_decisions_name_the_session_they_were_based_on(self):
        run = engine.run_config(config(), {"AAPL": series("AAPL", wavy(150))}).run
        assert run.decisions
        for d in run.decisions:
            assert d.based_on == d.time - DAY


def test_the_readmes_worked_example():
    """A 2/4 crossover on ten closes, checked by hand."""
    prices = [10.0, 10.0, 10.0, 10.0, 12.0, 13.0, 11.0, 9.0, 9.0, 10.0]
    cfg = config(fast=2, slow=4, initial_cash=1000.0, end=T0 + 9 * DAY, costs=Costs(commission=1.0, slippage_bps=10.0))
    run = engine.run_config(cfg, {"AAPL": series("AAPL", prices)}).run
    assert [((t.time - T0) // DAY + 1, t.side, round(t.shares, 4), round(t.price, 3)) for t in run.trades] == [(6, "buy", 76.7694, 13.013), (9, "sell", 76.7694, 8.991)]
    assert [round(r.total_value, 2) for r in run.ledger] == [1000.0] * 5 + [998.0, 844.46, 690.92, 689.23, 689.23]
    assert (round(run.metrics.total_return, 3), run.metrics.exposure) == (-0.311, 0.3)
