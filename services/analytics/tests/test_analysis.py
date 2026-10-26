"""More measures and period returns (analysis.py) against what MarketLab's TypeScript made of the golden results."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from analytics import analysis

HERE = Path(__file__).parent / "fixtures"
GOLDEN = {c["name"]: c for c in json.loads((HERE / "golden.json").read_text())["cases"]}
CASES = json.loads((HERE / "analysis.json").read_text())["cases"]


def same(a, b):
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, float) or isinstance(b, float):
        return a is not None and b is not None and math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-12)
    return a == b


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_matches_the_typescript_results(case):
    golden = GOLDEN[case["name"]]["expected"]
    out = analysis.extras(golden["run"], golden["benchmark"], case["costs"])
    assert same(out["analysis"], case["analysis"])
    assert same(out["periods"], case["periods"])


def test_period_returns_compound_months_into_years():
    day = 86_400_000
    jan1 = 1_767_225_600_000  # 2026-01-01 UTC
    equity = [{"time": jan1, "price": 100.0}, {"time": jan1 + 31 * day, "price": 110.0}, {"time": jan1 + 59 * day, "price": 99.0}]
    p = analysis.period_returns(equity)
    assert [round(m["value"], 6) for m in p["months"]] == [0.0, 0.1, -0.1]
    assert p["years"] == [{"year": 2026, "value": pytest.approx(-0.01), "partial": True}]
