import numpy as np
import pandas as pd
import pytest

from analytics import review
from tests.test_analytics import db  # noqa: F401  (the fixture)

DAY = 86_400_000
T0 = 1_700_000_000_000 - (1_700_000_000_000 % DAY) + 20 * 3_600_000  # a close at 20:00 UTC


def at(day, minutes=5):
    """A trade made `minutes` after day `day`'s close: it fills at that close."""
    return T0 + day * DAY + minutes * 60_000


def flat_history(symbols, days=200, price=100.0):
    return {s: [(T0 + d * DAY, price) for d in range(days)] for s in symbols}


def index(days=200):
    return [(T0 + d * DAY, 4000.0 + d) for d in range(days)]


def account(trades, holdings, cash=1000.0, events=()):
    """`trades` oldest first, for readability; the account keeps them newest first."""
    return {"cash": cash, "holdings": holdings, "trades": list(reversed(trades)), "events": list(reversed(events))}


def trade(day, symbol, side, shares, price, gain=None):
    t = {"time": at(day), "symbol": symbol, "side": side, "shares": shares, "price": price}
    if gain is not None:
        t["realizedGain"] = gain
    return t


def test_fifo_matches_the_oldest_shares_first_across_partial_sales():
    trades = [
        trade(1, "AAA", "buy", 10, 100),
        trade(5, "AAA", "buy", 10, 120),
        trade(10, "AAA", "sell", 15, 130, gain=15 * (130 - 110)),
    ]
    a = account(trades, [{"symbol": "AAA", "shares": 5, "averageCost": 110}])
    r = review.round_trips(a, flat_history(["AAA"]), at(150))
    closed = sorted(r["closed"], key=lambda t: t["entryPrice"])
    assert [(t["shares"], t["entryPrice"], t["gain"]) for t in closed] == [(10, 100, 300), (5, 120, 50)]
    assert [(t["shares"], t["entryPrice"]) for t in r["open"]] == [(5, 120)]


def test_starting_holdings_get_their_cost_from_the_first_sales_recorded_gain():
    # Started with 10 at $50 (not recorded), bought 10 at $70: average $60; sold 5 at $80 for a $100 gain.
    trades = [trade(2, "AAA", "buy", 10, 70), trade(4, "AAA", "sell", 5, 80, gain=100)]
    a = account(trades, [{"symbol": "AAA", "shares": 15, "averageCost": 60}])
    r = review.round_trips(a, flat_history(["AAA"]), at(150))
    assert r["closed"][0]["entry"] is None and r["closed"][0]["entryPrice"] == pytest.approx(50)
    assert r["closed"][0]["gain"] == pytest.approx(150)


def test_starting_holdings_never_sold_use_the_average_cost_now():
    a = account([trade(2, "AAA", "buy", 10, 70)], [{"symbol": "AAA", "shares": 20, "averageCost": 60}])
    r = review.round_trips(a, flat_history(["AAA"]), at(150))
    start = next(l for l in r["open"] if l["entry"] is None)
    assert start["entryPrice"] == pytest.approx(50)


def test_splits_multiply_lots():
    trades = [trade(1, "AAA", "buy", 10, 100), trade(20, "AAA", "sell", 20, 60, gain=20 * 10)]
    events = [{"time": T0 + 10 * DAY, "kind": "split", "symbol": "AAA", "shares": 10, "sharesAfter": 20, "cash": 0}]
    a = account(trades, [], events=events)
    r = review.round_trips(a, flat_history(["AAA"]), at(150))
    assert r["closed"][0]["shares"] == 20 and r["closed"][0]["entryPrice"] == 50 and r["closed"][0]["gain"] == 200


def test_disposition_counts_realised_and_paper_gains_on_selling_days():
    hist = {"WIN": [(T0 + d * DAY, 100 + d) for d in range(200)], "LOSE": [(T0 + d * DAY, 100 - d * 0.2) for d in range(200)]}
    trades = [trade(0, "WIN", "buy", 100, 100), trade(0, "LOSE", "buy", 100, 100)]
    for k in range(12):  # sells a winner every few days, never the loser
        trades.append(trade(10 + 5 * k, "WIN", "sell", 5, 110 + 5 * k, gain=5 * (10 + 5 * k)))
    a = account(trades, [{"symbol": "WIN", "shares": 40, "averageCost": 100}, {"symbol": "LOSE", "shares": 100, "averageCost": 100}])
    r = review.round_trips(a, hist, at(150))
    d = review.disposition(r["disposition"], r["sellDays"])
    assert d["enough"] and d["pgr"] == 1 and d["plr"] == 0 and d["difference"] == 1
    few = review.disposition(r["disposition"], 3)
    assert not few["enough"] and few["difference"] is None


def test_after_sales_returns_use_adjusted_closes():
    adjusted = {"AAA": pd.Series([100.0 * 1.01**d for d in range(100)], index=[T0 + d * DAY for d in range(100)])}
    market = pd.Series([1.0] * 100, index=[T0 + d * DAY for d in range(100)])
    out = review.after_sales([{"symbol": "AAA", "time": at(10), "price": 1}], adjusted, market)
    assert out["sales"][0]["after21"] == pytest.approx(1.01**21 - 1, rel=1e-5)
    assert out["sales"][0]["after63"] == pytest.approx(1.01**63 - 1, rel=1e-5)
    assert out["summary"]["21"]["averageVsMarket"] == pytest.approx(1.01**21 - 1, rel=1e-5)
    late = review.after_sales([{"symbol": "AAA", "time": at(90), "price": 1}], adjusted, market)
    assert late["sales"][0]["after21"] is None


def test_review_end_to_end_and_doing_nothing():
    days = 200
    hist = {"AAA": [(T0 + d * DAY, 100 + d * 0.5) for d in range(days)]}
    adjusted = {"AAA": pd.Series([p for _, p in hist["AAA"]], index=[t for t, _ in hist["AAA"]])}
    trades = [trade(1, "AAA", "buy", 10, 100.5), trade(50, "AAA", "sell", 10, 125, gain=245)]
    a = account(trades, [], cash=10_000)
    r = review.review(a, hist, adjusted, index(days), None)
    assert r["status"] == "ok" and r["summary"]["roundTrips"] == 1 and r["summary"]["hitRate"] == 1
    assert r["roundTrips"][0]["days"] == 49
    c = r["compared"]
    # Kept: the 10 shares bought on day 1, held to the end; actual sold them on day 50.
    assert c["returns"]["kept"] > c["returns"]["actual"] > 0
    assert len(c["times"]) == len(c["actual"]) == len(c["kept"]) == len(c["benchmark"])


def test_no_trades():
    assert review.review(account([], []), {}, {}, index(), None) == {"status": "no-trades"}


def test_round_trips_carry_the_buys_reason_and_group_by_it():
    trades = [
        {**trade(1, "AAA", "buy", 10, 100), "reason": "dip"},
        {**trade(2, "BBB", "buy", 10, 100), "reason": "momentum"},
        trade(3, "CCC", "buy", 10, 100),
        {**trade(10, "AAA", "sell", 10, 110, gain=100), "reason": "rebalance"},
        trade(11, "BBB", "sell", 10, 90, gain=-100),
        trade(12, "CCC", "sell", 10, 105, gain=50),
    ]
    a = account(trades, [])
    r = review.round_trips(a, flat_history(["AAA", "BBB", "CCC"]), at(150))
    by = {t["symbol"]: (t["reason"], t["exitReason"]) for t in r["closed"]}
    assert by == {"AAA": ("dip", "rebalance"), "BBB": ("momentum", None), "CCC": (None, None)}
    groups = {g["reason"]: g for g in review.by_reason(r["closed"])}
    assert groups["dip"]["hitRate"] == 1 and groups["momentum"]["hitRate"] == 0 and groups["none"]["roundTrips"] == 1



def test_endpoints(db):
    from fastapi.testclient import TestClient

    from main import app
    from tests.test_analytics import AUTH, DAY as D, T0 as START, put_series, walk

    n = 300
    times = [START + i * D for i in range(n)]
    prices = {s: walk(n, i + 1) * 100 for i, s in enumerate(["AAA", "BBB", "CCC", "DDD"])}
    put_series(db, "SPX", walk(n, 9) * 4000)
    for s, p in prices.items():
        put_series(db, s, p)
    trades = []
    for k, s in enumerate(["AAA", "BBB", "CCC", "DDD", "AAA", "BBB"]):
        buy, sell = 10 + 30 * k, 30 + 30 * k
        trades.append({"time": times[buy] + 60_000, "symbol": s, "side": "buy", "shares": 5, "price": round(float(prices[s][buy]), 2), "reason": "dip"})
        trades.append({"time": times[sell] + 60_000, "symbol": s, "side": "sell", "shares": 5, "price": round(float(prices[s][sell]), 2), "realizedGain": 0})
    body = {
        "source": "mock",
        "account": {"cash": 10_000, "holdings": [], "trades": trades[::-1], "events": []},
        "history": {s: {"times": times, "prices": [float(x) for x in p]} for s, p in prices.items()},
        "index": {"times": times, "prices": [float(x) for x in walk(n, 9) * 4000]},
    }
    client = TestClient(app)
    response = client.post("/v1/portfolio/review", json=body, headers=AUTH)
    assert response.status_code == 200, response.text
    data = response.json()["review"]
    assert data["status"] == "ok" and data["summary"]["roundTrips"] == 6 and data["byReason"][0]["reason"] == "dip"
    assert data["afterSales"]["summary"]["21"]["sales"] == 6
    bad = {**body, "account": {**body["account"], "trades": [{**trades[0], "reason": "astrology"}]}}
    assert client.post("/v1/portfolio/review", json=bad, headers=AUTH).status_code == 422
