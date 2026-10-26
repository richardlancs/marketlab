"""
Portfolio history and performance (performance.py) against fixed cases
made by the Next.js trading code (tests/fixtures/portfolio-history.json):
accounts built by real orders, dividends and splits, and the values the
former TypeScript history code gave for them.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from analytics import performance
from main import app

CASES = json.loads((Path(__file__).parent / "fixtures" / "portfolio-history.json").read_text())["cases"]
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def history_of(case):
    return {s: list(zip(h["times"], h["prices"])) for s, h in case["history"].items()}


def same(a, b):
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, float) or isinstance(b, float):
        return a is not None and b is not None and math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-9)
    return a == b


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_values_match_the_trading_code(case):
    if case["values"] is None:
        with pytest.raises(performance.MissingPrices):
            performance.value_series(case["account"], history_of(case), case["times"])
        return
    assert same(performance.value_series(case["account"], history_of(case), case["times"]), case["values"])
    timeline = performance.holdings_timeline(case["account"], case["times"])
    for state, expected in zip(timeline, case["timeline"]):
        assert state.cash == expected["cash"]
        assert same({k: v for k, v in state.shares.items()}, expected["shares"])


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_performance_matches(case):
    index = list(zip(case["index"]["times"], case["index"]["prices"]))
    assert same(performance.performance(case["account"], history_of(case), index), case["performance"])


def test_rounds_cents_like_javascript():
    assert performance.round_cents(1.005) == 1.0  # 1.005 is 1.00499999… in binary, as in JavaScript
    assert performance.round_cents(0.125) == 0.13  # halves go up, not to even
    assert performance.round_cents(-0.125) == -0.12


def test_the_endpoint(monkeypatch):
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    case = next(c for c in CASES if c["name"] == "random-trading")
    a = case["account"]
    # What the Next.js server sends: only the fields the history needs.
    account = {
        "cash": a["cash"],
        "holdings": [{"symbol": h["symbol"], "shares": h["shares"]} for h in a["holdings"]],
        "trades": [{k: t[k] for k in ("time", "symbol", "side", "shares", "price")} for t in a["trades"]],
        "events": [{k: e[k] for k in ("time", "kind", "symbol", "shares", "cash")} for e in a.get("events", [])],
    }
    body = {"account": account, "history": case["history"], "index": case["index"]}
    data = TestClient(app).post("/v1/portfolio/performance", json=body, headers=AUTH).json()
    assert same(data, case["performance"])
