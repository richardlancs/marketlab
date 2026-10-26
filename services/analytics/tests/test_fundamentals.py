"""
SEC company facts (fundamentals.py) against fixed cases
(tests/fixtures/company-facts.json): raw inputs and what the former
TypeScript parser made of them, plus fetching with a fake SEC.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from analytics import fundamentals
from main import app

CASES = json.loads((Path(__file__).parent / "fixtures" / "company-facts.json").read_text())["cases"]
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_parses_like_before(case):
    assert fundamentals.parse_company_facts(case["input"]) == case["expected"]


def fake_sec(status: int, body: object = None):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"], seen["agent"] = str(request.url), request.headers["user-agent"]
        return httpx.Response(status, json=body)

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


def test_fetches_by_cik_naming_who_asks():
    client, seen = fake_sec(200, CASES[0]["input"])
    assert fundamentals.fetch_company_facts(42, "MarketLab test@example.com", client) == CASES[0]["expected"]
    assert seen == {"url": "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000042.json", "agent": "MarketLab test@example.com"}


def test_a_company_without_a_facts_file_has_no_numbers_and_errors_are_errors():
    client, _ = fake_sec(404)
    assert fundamentals.fetch_company_facts(1, "x", client) is None
    client, _ = fake_sec(503)
    with pytest.raises(fundamentals.FetchError):
        fundamentals.fetch_company_facts(1, "x", client)


def test_the_endpoint_tries_each_cik_in_turn(monkeypatch):
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    asked = []

    def fake(cik, user_agent, client=None):
        asked.append(cik)
        return None if cik == 1 else {"cik": cik}

    monkeypatch.setattr(fundamentals, "fetch_company_facts", fake)
    response = TestClient(app).post("/v1/fundamentals/company", json={"ciks": [1, 34088], "userAgent": "MarketLab x@example.com"}, headers=AUTH)
    assert response.json() == {"facts": {"cik": 34088}} and asked == [1, 34088]


def test_the_endpoint_reports_an_unreachable_sec(monkeypatch):
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)

    def fail(cik, user_agent, client=None):
        raise fundamentals.FetchError("down")

    monkeypatch.setattr(fundamentals, "fetch_company_facts", fail)
    response = TestClient(app).post("/v1/fundamentals/company", json={"ciks": [1], "userAgent": "x"}, headers=AUTH)
    assert response.status_code == 200 and response.json() == {"facts": None, "failed": True}


def example_corp():
    return next(c for c in CASES if c["name"] == "company")["expected"]


def test_ratios_from_growth_margins_returns_and_value():
    r = fundamentals.ratios_of(example_corp(), 30, 600)
    assert r["revenueGrowth"] == pytest.approx(0.2) and r["epsGrowth"] == pytest.approx(0.5)
    assert r["netMargin"] == pytest.approx(18 / 131) and r["grossMargin"] is None
    assert r["returnOnEquity"] == pytest.approx(15 / 60)
    assert r["priceToSales"] == pytest.approx(600 / 131) and r["freeCashFlowYield"] == pytest.approx(15 / 600)
    # By value: market value over trailing earnings, so it works without earnings per share.
    assert r["peRatio"] == pytest.approx(600 / 18)


def test_without_a_market_value_it_uses_diluted_shares_and_skips_meaningless_ratios():
    facts = example_corp()
    losing = {**facts, "trailing": {**facts["trailing"], "eps": -2}, "years": [{**y, "equity": -5} for y in facts["years"]]}
    r = fundamentals.ratios_of(losing, 30, None)
    assert r["priceToSales"] == pytest.approx(300 / 131) and r["peRatio"] is None and r["returnOnEquity"] is None
    assert fundamentals.ratios_of({**facts, "trailing": {**facts["trailing"], "eps": 2}}, 30, None)["peRatio"] == 15


def test_numbers_are_current_for_15_months():
    june_2027, november_2027 = 1_811_808_000_000, 1_825_027_200_000
    assert fundamentals.is_current(example_corp(), june_2027) and not fundamentals.is_current(example_corp(), november_2027)
