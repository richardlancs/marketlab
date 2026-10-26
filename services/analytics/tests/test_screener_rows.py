"""Screener rows and company ratios (screener.py, fundamentals.py) against what MarketLab's TypeScript made of stored data."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from analytics import fundamentals, screener

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "screener.json").read_text())


def same(a, b):
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, float) or isinstance(b, float):
        return a is not None and b is not None and math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-15)
    return a == b


def test_rows_match_the_typescript_ones():
    f = FIXTURE
    inputs = []
    for s in f["catalog"]:
        p = f["profiles"].get(s["symbol"])
        if p is None:
            continue
        m = f["meta"].get(s["symbol"]) or {}
        facts = f["facts"].get(s["symbol"])
        inputs.append({**s, "profile": p, "marketCap": m.get("marketCap"), "peRatio": m.get("peRatio"), "dividendYield": m.get("dividendYield"), "facts": facts if facts and fundamentals.is_current(facts, f["now"]) else None})
    rows = screener.build_rows(inputs)
    assert len(rows) == len(f["rows"]) > 90
    for mine, theirs in zip(rows, f["rows"]):
        assert same(mine, theirs), mine["symbol"]


@pytest.mark.parametrize("case", FIXTURE["ratios"], ids=[f"{c['symbol']}-{c['price']}" for c in FIXTURE["ratios"]])
def test_ratios_and_currency_match(case):
    facts = FIXTURE["facts"][case["symbol"]]
    assert same(fundamentals.ratios_of(facts, case["price"], case["marketCap"]), case["ratios"])
    assert fundamentals.is_current(facts, FIXTURE["now"]) == case["current"]


def test_percentiles_share_ties():
    assert screener.percentiles([3, None, 1, 3, 2]) == pytest.approx([2.5 / 3, None, 0.0, 2.5 / 3, 1 / 3])
    assert screener.percentiles([None, 5]) == [None, 0.5]


def test_the_endpoints(monkeypatch):
    from fastapi.testclient import TestClient

    from main import app

    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", "t")
    auth = {"Authorization": "Bearer t"}
    case = FIXTURE["ratios"][0]
    body = {"facts": FIXTURE["facts"][case["symbol"]], "price": case["price"], "marketCap": case["marketCap"], "now": FIXTURE["now"]}
    data = TestClient(app).post("/v1/fundamentals/ratios", json=body, headers=auth).json()
    assert same(data["ratios"], case["ratios"]) and data["current"] == case["current"]
