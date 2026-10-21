"""
Historical screening (analytics/screens.py): the timing rule, monthly
scheduling, warm-up, ranking and ties, missing prices, the books, and saving
and reproducing through the database and the API.
"""

from __future__ import annotations

import copy
import json
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from analytics import api, db as database, screens
from analytics.execution import Costs
from main import app

ROOT = Path(__file__).resolve().parents[3]
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
#: Market holidays in the test calendar: New Year's Day 2024 is a Monday, Independence Day 2024 a Thursday.
HOLIDAYS = {date(2023, 1, 2), date(2023, 7, 4), date(2023, 12, 25), date(2024, 1, 1), date(2024, 7, 4), date(2024, 12, 25)}


def ms(d: date) -> int:
    """A session's time: 21:00 UTC (the US close), as the market data has it."""
    return int(datetime(d.year, d.month, d.day, 21, tzinfo=timezone.utc).timestamp() * 1000)


def sessions(first: date, last: date) -> list[int]:
    days, d = [], first
    while d <= last:
        if d.weekday() < 5 and d not in HOLIDAYS:
            days.append(ms(d))
        d += timedelta(days=1)
    return days


CALENDAR = sessions(date(2022, 1, 3), date(2024, 12, 31))
SYMBOLS = [f"S{i:02d}" for i in range(30)]


def trend(i: int, n: int, drift: float) -> float:
    return 50 * (1 + drift) ** n * (1 + 0.004 * math.sin(n / 7 + i))


def universe(drifts: dict[str, float] | None = None, calendar=CALENDAR) -> dict[str, pd.Series]:
    """30 stocks with steady trends: S29 rises fastest, S00 falls fastest."""
    drifts = drifts or {s: (i - 12) * 0.0001 for i, s in enumerate(SYMBOLS)}
    return {s: pd.Series([trend(i, n, drifts[s]) for n in range(len(calendar))], index=pd.Index(calendar), name=s) for i, s in enumerate(drifts)}


MARKET = pd.Series([4000 * 1.0003**n for n in range(len(CALENDAR))], index=pd.Index(CALENDAR))
SETTINGS = screens.Settings(start=ms(date(2023, 3, 15)), end=ms(date(2024, 12, 31)), initial_cash=10_000, costs=Costs(commission=1, slippage_bps=10))


def snapshot_of(closes, settings=SETTINGS, market=MARKET):
    return screens.build_snapshot(universe=sorted(closes), market=market, closes=closes, settings=settings, source="mock", as_of=int(market.index[-1]))


def run(closes, settings=SETTINGS, market=MARKET):
    snapshot = snapshot_of(closes, settings, market)
    return snapshot, screens.run_screen(snapshot, settings)


def picks(result) -> list[tuple[int, list[str]]]:
    return [(m["decision"], [s["symbol"] for s in m["selected"]]) for m in result["months"]]


def index_of(t: int) -> int:
    return CALENDAR.index(t)


# --- Scheduling -------------------------------------------------------------------


def test_decides_on_the_first_session_then_the_first_trading_session_of_each_month():
    first = CALENDAR.index(ms(date(2023, 3, 15)))
    days = [datetime.fromtimestamp(CALENDAR[d] / 1000, tz=timezone.utc).date() for d in screens.decision_days(CALENDAR, first)]
    assert days[0] == date(2023, 3, 15)  # the start itself, mid-month
    assert date(2023, 4, 3) in days  # Apr 1-2, 2023 are a weekend
    assert date(2023, 7, 3) in days  # Jul 1-2 a weekend; Jul 4 a holiday but not the first session
    assert date(2023, 10, 2) in days  # Oct 1, 2023 is a Sunday
    assert date(2024, 1, 2) in days and date(2024, 1, 1) not in days  # New Year's Day, a Monday holiday
    assert date(2024, 6, 3) in days  # Jun 1, 2024 is a Saturday
    assert len(days) == 1 + 21  # the start, then Apr 2023 through Dec 2024
    assert all(days[i].month != days[i + 1].month for i in range(len(days) - 1))


def test_every_decision_is_based_on_the_previous_session():
    _, result = run(universe())
    for m in result["months"]:
        assert m["basedOn"] == CALENDAR[index_of(m["decision"]) - 1]
    assert len(result["months"]) == 22


# --- The timing rule -------------------------------------------------------------------


def test_later_prices_cannot_change_earlier_decisions_or_values():
    closes = universe()
    _, before = run(closes)
    cut = index_of(ms(date(2023, 11, 1)))
    # Turn the future upside down: the leaders crash and the laggards soar after the cut.
    changed = {s: series.copy() for s, series in closes.items()}
    for i, s in enumerate(SYMBOLS):
        changed[s].iloc[cut + 1 :] *= [(0.2 if i > 15 else 5.0) * (1 + n / 1000) for n in range(len(CALENDAR) - cut - 1)]
    _, after = run(changed)

    through = CALENDAR[cut]
    assert [p for p in picks(before) if p[0] <= through] == [p for p in picks(after) if p[0] <= through]
    assert [m["table"] for m in before["months"] if m["decision"] <= through] == [m["table"] for m in after["months"] if m["decision"] <= through]
    assert [t for t in before["run"]["trades"] if t["time"] <= through] == [t for t in after["run"]["trades"] if t["time"] <= through]
    assert [p for p in before["run"]["equity"] if p["time"] <= through] == [p for p in after["run"]["equity"] if p["time"] <= through]
    assert picks(before) != picks(after)  # and the change does matter later


def test_the_decision_days_own_close_cannot_change_its_selection():
    closes = universe()
    _, before = run(closes)
    month = before["months"][3]
    day = index_of(month["decision"])
    leader = month["selected"][0]["symbol"]
    changed = {s: series.copy() for s, series in closes.items()}
    changed[leader].iloc[day] *= 0.3  # the leader crashes at the decision day's close...
    changed["S00"].iloc[day] *= 4.0  # ...and the weakest stock jumps
    _, after = run(changed)

    assert after["months"][3]["selected"] == month["selected"]  # the same picks, the same numbers
    assert after["months"][3]["table"] == month["table"]
    # Only the fills moved: the trades of that day use that day's close.
    traded = [t for t in after["months"][3]["trades"] if t["symbol"] == leader]
    assert traded and traded[0]["close"] == pytest.approx(changed[leader].iloc[day])
    # And the jump is first seen by the next decision, a month later.
    assert after["months"][4]["table"] != before["months"][4]["table"]


def test_rank_is_never_given_the_decision_session():
    seen = []
    original = screens.rank

    def spy(history):
        seen.append({s: len(p) for s, p in history.items()})
        return original(history)

    screens.rank = spy
    try:
        _, result = run(universe())
    finally:
        screens.rank = original
    for lengths, m in zip(seen, result["months"]):
        assert set(lengths.values()) == {index_of(m["decision"]) - index_of(result["period"]["dataStart"])}  # sessions before D only


# --- Ranking ------------------------------------------------------------------------------


def test_applies_the_momentum_leaders_rules():
    _, result = run(universe())
    month = result["months"][0]
    # 30 ranked stocks: the 80th percentile and up is the top 6 (S24-S29), all rising, so all above their averages.
    assert month["ranked"] == 30 and month["qualifying"] == 6
    assert [s["symbol"] for s in month["selected"]] == ["S29", "S28", "S27", "S26", "S25"]
    assert [s["rank"] for s in month["selected"]] == [1, 2, 3, 4, 5]
    assert all(s["weight"] == 0.2 for s in month["selected"])
    statuses = {row[0]: row[1] for row in month["table"]}
    assert statuses["S24"] == "qualified" and statuses["S23"] == "low-momentum"
    assert "Ranked 1st of 6 qualifying stocks" in month["selected"][0]["explanation"]
    assert "above its 200-day average" in month["selected"][0]["explanation"]


def test_momentum_and_the_average_use_the_profile_definitions():
    closes = universe()
    day = index_of(ms(date(2023, 6, 1)))
    history = {s: list(closes[s].iloc[:day]) for s in closes}
    by_symbol = {c.symbol: c for c in screens.rank(history)}
    s = closes["S29"].iloc[:day]
    assert by_symbol["S29"].momentum == pytest.approx(s.iloc[-22] / s.iloc[-253] - 1, rel=1e-15)
    assert by_symbol["S29"].average == pytest.approx(s.iloc[-200:].mean(), rel=1e-12)
    assert by_symbol["S29"].close == s.iloc[-1]


def test_percentiles_match_the_screener():
    assert screens.percentiles([5.0]) == [0.5]
    assert screens.percentiles([3.0, 1.0, 2.0]) == [1.0, 0.0, 0.5]
    assert screens.percentiles([1.0, 2.0, 2.0, 3.0]) == [0.0, 0.5, 0.5, 1.0]  # ties share the average rank


def test_breaks_ties_alphabetically():
    drifts = {s: 0.0005 for s in ["MMM", "AAA", "ZZZ", "BBB"]} | {f"L{i:02d}": -0.001 for i in range(20)}
    closes = {s: pd.Series([50 * (1 + d) ** n for n in range(len(CALENDAR))], index=pd.Index(CALENDAR)) for s, d in drifts.items()}
    _, result = run(closes)
    month = result["months"][0]
    assert [s["symbol"] for s in month["selected"]] == ["AAA", "BBB", "MMM", "ZZZ"]
    assert len({s["momentum"] for s in month["selected"]}) == 1


def test_holds_cash_for_slots_nobody_fills():
    # Only two of 30 rise; the rest fall, so the top fifth includes falling stocks that are below their averages.
    drifts = {s: (0.001 if i < 2 else -0.0005 - i * 0.00001) for i, s in enumerate(SYMBOLS)}
    _, result = run(universe(drifts))
    month = result["months"][0]
    assert sorted(s["symbol"] for s in month["selected"]) == ["S00", "S01"]
    assert month["cash"] / month["value"] == pytest.approx(0.6, abs=0.001)
    assert any("Only 2 stocks qualified, so 60% was left in cash." == n for n in month["notes"])
    statuses = {row[0]: row[1] for row in month["table"]}
    assert "below-average" in statuses.values()


# --- Warm-up --------------------------------------------------------------------------------


def test_uses_earlier_history_to_warm_up_when_it_exists():
    snapshot, result = run(universe())
    assert result["period"]["start"] == ms(date(2023, 3, 15))
    assert result["warnings"] == []
    assert snapshot["calendar"][0] == CALENDAR[index_of(ms(date(2023, 3, 15))) - screens.WARMUP_SESSIONS]
    assert result["period"]["warmupSessions"] == screens.WARMUP_SESSIONS


def test_reports_too_little_history_and_the_actual_period():
    early = screens.Settings(start=ms(date(2022, 2, 1)), end=SETTINGS.end, initial_cash=10_000)
    _, result = run(universe(), early)
    first = CALENDAR[screens.MOMENTUM_SESSIONS]  # the first session with 253 earlier closes
    assert result["period"]["start"] == first
    assert result["period"]["requestedStart"] == early.start
    assert result["run"]["equity"][0]["time"] == first and result["benchmark"]["equity"][0]["time"] == first
    [warning] = result["warnings"]
    assert "Results start on" in warning and "253 daily closes" in warning


def test_refuses_a_period_with_no_rankable_day():
    short = screens.Settings(start=ms(date(2022, 2, 1)), end=ms(date(2022, 6, 1)), initial_cash=10_000)
    with pytest.raises(screens.ScreenError, match="choose a later end date"):
        run(universe(), short)


def test_a_stock_listed_later_waits_for_its_own_history():
    closes = universe()
    late = closes["S29"].copy()
    late.iloc[: index_of(ms(date(2023, 1, 3)))] = float("nan")  # "lists" in Jan 2023
    closes["S29"] = late.dropna()
    _, result = run(closes)
    first = {row[0]: row for row in result["months"][0]["table"]}["S29"]
    assert first[1] == "short-history"
    assert "S29" not in [s["symbol"] for s in result["months"][0]["selected"]]
    assert "S29" in [s["symbol"] for s in result["months"][-1]["selected"]]  # once it has a year of closes


# --- Missing prices ---------------------------------------------------------------------------


def with_gap(closes, symbol, *days):
    out = {s: series.copy() for s, series in closes.items()}
    out[symbol] = out[symbol].drop([CALENDAR[d] for d in days])
    return out


def test_a_stock_without_a_price_on_the_latest_session_isnt_ranked():
    closes = universe()
    _, base = run(closes)
    day = index_of(base["months"][2]["decision"])
    _, result = run(with_gap(closes, "S29", day - 1))
    row = {r[0]: r for r in result["months"][2]["table"]}["S29"]
    assert row[1] == "no-price"
    assert "S29" not in [s["symbol"] for s in result["months"][2]["selected"]]
    assert result["universe"]["count"] == 30  # still a candidate; nothing was dropped


def test_a_pick_without_a_price_on_the_trading_day_isnt_bought():
    closes = universe()
    _, base = run(closes)
    day = index_of(base["months"][0]["decision"])
    _, result = run(with_gap(closes, "S27", day))
    month = result["months"][0]
    assert "S27" in [s["symbol"] for s in month["selected"]]  # chosen from the day before...
    assert "S27" not in [t["symbol"] for t in month["trades"]]  # ...but never traded at an invented price
    assert month["cash"] / month["value"] == pytest.approx(0.2, abs=0.002)
    assert any("S27 had no price" in n and "stays in cash until next month" in n for n in month["notes"])


def falling_leader():
    """S29 leads at the start, then falls 0.3% a day, so it drops below its 200-day average and is sold."""
    closes = universe()
    cut = index_of(SETTINGS.start)
    s = closes["S29"].copy()
    s.iloc[cut:] = s.iloc[cut] * pd.Series([0.997**n for n in range(len(CALENDAR) - cut)]).to_numpy()
    closes["S29"] = s
    return closes


def test_a_stock_that_stops_qualifying_is_sold_with_its_reason():
    _, result = run(falling_leader())
    assert "S29" in [s["symbol"] for s in result["months"][0]["selected"]]
    m = next(m for m in result["months"] if any(x["symbol"] == "S29" for x in m["left"]))
    reason = next(x["explanation"] for x in m["left"] if x["symbol"] == "S29")
    assert "below its 200-day average" in reason
    assert [t["side"] for t in m["trades"] if t["symbol"] == "S29"] == ["sell"]
    assert "S24" in m["entered"]  # the next in line takes its place


def test_a_stock_to_sell_without_a_price_is_sold_on_its_next_trading_day():
    closes = falling_leader()
    _, base = run(closes)
    i, month = next((i, m) for i, m in enumerate(base["months"]) if any(x["symbol"] == "S29" for x in m["left"]))
    day = index_of(month["decision"])
    _, result = run(with_gap(closes, "S29", day, day + 1))
    after = result["months"][i]
    sale = [t for t in after["trades"] if t["symbol"] == "S29"]
    assert len(sale) == 1 and sale[0]["side"] == "sell" and sale[0]["time"] == CALENDAR[day + 2]
    assert sale[0]["close"] == closes["S29"].iloc[day + 2]
    assert any("S29 had no price" in n for n in after["notes"])
    assert any("S29 was sold on" in n for n in after["notes"])


def test_a_held_stock_without_a_price_is_valued_at_its_latest_close():
    closes = universe()
    _, base = run(closes)
    held = base["months"][0]["selected"][0]["symbol"]
    day = index_of(base["months"][0]["decision"]) + 3  # mid-month: no trading that day
    _, result = run(with_gap(closes, held, day))
    values = {p["time"]: p["price"] for p in result["run"]["equity"]}
    base_values = {p["time"]: p["price"] for p in base["run"]["equity"]}
    shares = next(t["shares"] for t in result["months"][0]["trades"] if t["symbol"] == held)
    expected = base_values[CALENDAR[day]] + shares * (closes[held].iloc[day - 1] - closes[held].iloc[day])
    assert values[CALENDAR[day]] == pytest.approx(expected, abs=0.01)


def test_a_candidate_with_no_prices_stays_in_the_universe():
    closes = universe()
    snapshot = screens.build_snapshot(universe=[*closes, "GONE"], market=MARKET, closes=closes, settings=SETTINGS, source="mock", as_of=CALENDAR[-1])
    result = screens.run_screen(snapshot, SETTINGS)
    assert result["universe"]["count"] == 31 and result["universe"]["neverPriced"] == ["GONE"]
    assert {r[0]: r[1] for r in result["months"][0]["table"]}["GONE"] == "no-data"


# --- The books -------------------------------------------------------------------------------


def test_cash_positions_costs_and_value_reconcile():
    _, result = run(universe())
    cash = SETTINGS.initial_cash
    shares: dict[str, float] = {}
    commission = slippage = 0.0
    month_trades = [t for m in result["months"] for t in m["trades"]]
    assert len(month_trades) == len(result["run"]["trades"]) == result["run"]["metrics"]["trades"]
    for m in result["months"]:
        for t in m["trades"]:
            flow = t["shares"] * t["price"]
            cash += -flow - t["commission"] if t["side"] == "buy" else flow - t["commission"]
            shares[t["symbol"]] = shares.get(t["symbol"], 0.0) + (t["shares"] if t["side"] == "buy" else -t["shares"])
            commission += t["commission"]
            slippage += t["shares"] * abs(t["price"] - t["close"])
            assert t["price"] == pytest.approx(t["close"] * (1.001 if t["side"] == "buy" else 0.999), rel=1e-12)
        assert m["cash"] == pytest.approx(cash, abs=1e-6)
        assert m["commission"] == pytest.approx(sum(t["commission"] for t in m["trades"]))
    assert cash >= -1e-9  # never borrowed
    last = CALENDAR.index(result["period"]["end"])
    closes = universe()
    final = cash + sum(n * closes[s].iloc[last] for s, n in shares.items())
    assert result["run"]["metrics"]["finalValue"] == pytest.approx(final, rel=1e-12)
    assert result["costs"]["commission"] == pytest.approx(commission) == result["run"]["metrics"]["trades"] * 1.0
    assert result["costs"]["slippage"] == pytest.approx(slippage)
    assert result["costs"]["total"] == pytest.approx(commission + slippage)
    assert all(-1e-9 <= n for n in shares.values())
    assert sum(1 for n in shares.values() if n > 1e-9) <= 5


def test_compares_with_the_market_over_the_same_days():
    _, result = run(universe())
    assert [p["time"] for p in result["benchmark"]["equity"]] == [p["time"] for p in result["run"]["equity"]]
    assert result["benchmark"]["dividends"] == "excluded"  # the mock market's index is a price index
    assert result["benchmark"]["trades"][0]["commission"] == 1


def test_turnover_is_sales_over_average_value_per_year():
    _, result = run(universe())
    equity = [p["price"] for p in result["run"]["equity"]]
    sold = sum(t["shares"] * t["price"] for t in result["run"]["trades"] if t["side"] == "sell")
    years = (result["period"]["end"] - result["period"]["start"]) / (365.25 * 86_400_000)
    assert result["turnover"] == pytest.approx(sold / (sum(equity) / len(equity)) / years, rel=1e-3)


# --- Reproducibility ------------------------------------------------------------------------


def test_the_same_snapshot_always_gives_the_same_result():
    snapshot, first = run(universe())
    again = screens.run_screen(json.loads(json.dumps(snapshot)), SETTINGS)  # as read back from the database
    assert json.dumps(first, sort_keys=True) == json.dumps(again, sort_keys=True)
    assert screens.compare(first, again) == {"matches": True, "largestDifference": 0.0, "differences": []}
    assert screens.checksum_of(snapshot) == screens.checksum_of(json.loads(json.dumps(snapshot)))


def test_compare_notices_a_different_selection():
    _, first = run(universe())
    changed = copy.deepcopy(first)
    changed["months"][2]["selected"][0]["symbol"] = "S00"
    assert screens.compare(first, changed)["matches"] is False


# --- Through the database and the API ------------------------------------------------------


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    sqlite = database.SqliteDatabase(path)
    for migration in sorted((ROOT / "drizzle").glob("*.sql")):
        for statement in migration.read_text().split("--> statement-breakpoint"):
            if statement.strip():
                sqlite.execute(statement)
    sqlite.execute("INSERT INTO user (id, name, email) VALUES ('owner-1', 'A', 'a@example.com'), ('owner-2', 'B', 'b@example.com')")
    store_prices(sqlite, {**universe(), "SPX": MARKET})
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    app.dependency_overrides[api.get_database] = lambda: sqlite
    yield sqlite
    app.dependency_overrides.clear()


def store_prices(sqlite, series):
    rows = []
    for symbol, s in series.items():
        sqlite.execute(
            "INSERT OR REPLACE INTO price_series (source, symbol, checksum, first_time, last_time, bars, updated_at) VALUES ('mock', ?, ?, ?, ?, ?, 0)",
            [symbol, f"c-{symbol}", int(s.index[0]), int(s.index[-1]), len(s)],
        )
        rows += [("INSERT OR REPLACE INTO daily_bar (source, symbol, time, open, high, low, close, adj_close, volume) VALUES ('mock', ?, ?, ?, ?, ?, ?, ?, NULL)", [symbol, int(t), p, p, p, p, p]) for t, p in s.items()]
    sqlite.execute_many(rows)


client = TestClient(app)


def config(**overrides):
    return {
        "version": 1,
        "preset": "momentum",
        "start": SETTINGS.start,
        "end": SETTINGS.end,
        "initialCash": 10_000,
        "costs": {"commission": 1, "slippageBps": 10},
        "universe": SYMBOLS,
        **overrides,
    }


def test_runs_from_the_stored_prices(db):
    response = client.post("/v1/screens/history", json={"source": "mock", "config": config()}, headers=AUTH)
    assert response.status_code == 200
    result = response.json()["result"]
    _, direct = run(universe())
    assert picks(result) == picks(direct)
    assert result["run"]["metrics"] == direct["run"]["metrics"]
    assert result["provenance"]["method"] == {"name": "monthly-momentum-leaders", "version": screens.SCREEN_VERSION}
    assert result["provenance"]["dataset"]["simulated"] is True


def test_saves_and_reproduces_from_the_saved_prices_alone(db):
    body = {"ownerId": "owner-1", "run": {"id": "screen-1", "name": "Leaders", "createdAt": 1}, "source": "mock", "config": config()}
    saved = client.post("/v1/saved-screens", json=body, headers=AUTH)
    assert saved.status_code == 200
    [row] = db.query("SELECT kind, config, result, snapshot_checksum, data_source, simulated FROM backtest_run WHERE id = 'screen-1'")
    assert row["kind"] == "historical-screen" and row["data_source"] == "mock" and row["simulated"] == 1
    [snap] = db.query("SELECT data FROM price_snapshot WHERE checksum = ?", [row["snapshot_checksum"]])
    snapshot = json.loads(snap["data"])
    assert sorted(snapshot["closes"]) == SYMBOLS  # every candidate, chosen or not
    assert json.loads(row["config"])["universe"] == SYMBOLS

    # The stored prices change afterwards (a later revision of history): reproducing still uses the saved ones.
    store_prices(db, {s: series * 1.5 for s, series in universe().items()})
    reproduced = client.post("/v1/saved-screens/screen-1/reproduce", json={"ownerId": "owner-1"}, headers=AUTH)
    assert reproduced.status_code == 200
    assert reproduced.json()["comparison"] == {"matches": True, "largestDifference": 0.0, "differences": []}
    stored = json.loads(row["result"])
    assert picks(reproduced.json()["reproduced"]) == picks(stored)


def test_only_the_owner_can_reproduce_and_backtest_routes_refuse_screens(db):
    body = {"ownerId": "owner-1", "run": {"id": "screen-1", "name": "Leaders", "createdAt": 1}, "source": "mock", "config": config()}
    assert client.post("/v1/saved-screens", json=body, headers=AUTH).status_code == 200
    assert client.post("/v1/saved-screens/screen-1/reproduce", json={"ownerId": "owner-2"}, headers=AUTH).status_code == 404
    assert client.post("/v1/saved-runs/screen-1/reproduce", json={"ownerId": "owner-1"}, headers=AUTH).status_code == 404


def test_saved_screens_count_towards_the_saved_run_limit(db):
    for i in range(database.MAX_SAVED_RUNS):
        db.execute("INSERT INTO backtest_run (id, user_id, name, config, summary, created_at) VALUES (?, 'owner-1', 'r', '{}', '{}', 1)", [f"r{i}"])
    body = {"ownerId": "owner-1", "run": {"id": "screen-1", "name": "Leaders", "createdAt": 1}, "source": "mock", "config": config()}
    response = client.post("/v1/saved-screens", json=body, headers=AUTH)
    assert response.status_code == 409


def test_the_api_checks_the_token_and_the_settings(db):
    assert client.post("/v1/screens/history", json={"source": "mock", "config": config()}).status_code == 401
    for bad in (config(universe=[]), config(universe=["S01", "S01"]), config(start=SETTINGS.end), config(preset="value"), config(universe=["bad symbol"]), config(initialCash=5)):
        assert client.post("/v1/screens/history", json={"source": "mock", "config": bad}, headers=AUTH).status_code == 422
    too_early = config(start=ms(date(2021, 1, 4)), end=ms(date(2021, 6, 1)))
    response = client.post("/v1/screens/history", json={"source": "mock", "config": too_early}, headers=AUTH)
    assert response.status_code == 422
