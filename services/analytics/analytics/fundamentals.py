"""
Company numbers from the SEC's "company facts" API
(data.sec.gov/api/xbrl/companyfacts/CIK##########.json): what each company
reported in its 10-K and 10-Q filings, tagged in XBRL. They're public
records, so unlike licensed price data they can be shown on the public site,
next to simulated prices.

Companies tag the same idea in different ways (Apple's revenue is
"RevenueFromContractWithCustomerExcludingAssessedTax", JPMorgan's is
"RevenuesNetOfInterestExpense"), so each line tries a list of tags. Only US
dollar amounts are read: a company reporting in another currency has no
numbers here rather than misleading ones.

The Next.js server finds a ticker's CIK (SEC company number) and stores the
result; ratios that depend on today's price are worked out there
(lib/market/fundamentals.ts). The output's shape is that file's
CompanyFacts type.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from datetime import date
from typing import Any

import httpx

REVENUE = {
    "us-gaap": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenuesNetOfInterestExpense", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
    "ifrs-full": ["Revenue", "RevenueFromContractsWithCustomers"],
}
COST_OF_REVENUE = {"us-gaap": ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"], "ifrs-full": ["CostOfSales"]}
GROSS_PROFIT = {"us-gaap": ["GrossProfit"], "ifrs-full": ["GrossProfit"]}
OPERATING_INCOME = {"us-gaap": ["OperatingIncomeLoss"], "ifrs-full": ["ProfitLossFromOperatingActivities"]}
NET_INCOME = {
    "us-gaap": ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"],
    "ifrs-full": ["ProfitLossAttributableToOwnersOfParent", "ProfitLoss"],
}
EPS = {"us-gaap": ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"], "ifrs-full": ["DilutedEarningsLossPerShare", "BasicEarningsLossPerShare"]}
DILUTED_SHARES = {"us-gaap": ["WeightedAverageNumberOfDilutedSharesOutstanding"], "ifrs-full": ["AdjustedWeightedAverageShares"]}
EQUITY = {"us-gaap": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], "ifrs-full": ["EquityAttributableToOwnersOfParent", "Equity"]}
OPERATING_CASH_FLOW = {
    "us-gaap": ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "ifrs-full": ["CashFlowsFromUsedInOperatingActivities"],
}
CAPITAL_SPENDING = {
    "us-gaap": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    "ifrs-full": ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
}

# Annual and quarterly reports, US and foreign, with amendments.
FORMS = {"10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"}
YEARS = 5


def _days(start: str, end: str) -> float:
    return (date.fromisoformat(end) - date.fromisoformat(start)).days


def _is_year(f: dict) -> bool:
    return f["start"] is not None and 350 <= _days(f["start"], f["end"]) <= 380


def _is_quarter(length: float) -> bool:
    return 80 <= length <= 100


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _facts_of(taxonomy: Mapping[str, Any] | None, concept: str, unit: str) -> list[dict]:
    """A tag's well-formed facts in `unit`, from the forms above; a period reported twice keeps its latest filing (a restatement)."""
    entry = (taxonomy or {}).get(concept)
    units = entry.get("units") if isinstance(entry, dict) else None
    items = units.get(unit) if isinstance(units, dict) else None
    if not isinstance(items, list):
        return []
    by_period: dict[str, dict] = {}
    for raw in items:
        if not isinstance(raw, dict):
            continue
        start, end, val, filed, form = raw.get("start"), raw.get("end"), raw.get("val"), raw.get("filed"), raw.get("form")
        if not isinstance(end, str) or not _is_number(val) or not isinstance(filed, str) or not isinstance(form, str) or form not in FORMS:
            continue
        if start is not None and not isinstance(start, str):
            continue
        key = f"{start or ''}|{end}"
        seen = by_period.get(key)
        if seen is None or filed > seen["filed"]:
            by_period[key] = {"start": start, "end": end, "val": val, "filed": filed}
    return list(by_period.values())


def _quarters_of(facts: list[dict]) -> dict[str, float]:
    """
    Quarter values by their last day. Reported three-month periods are used as
    they are; others come from differences, as companies often report only
    year-to-date figures (and no fourth quarter at all): nine months less six,
    or the full year less nine months.
    """
    quarters: dict[str, float] = {}
    durations = [f for f in facts if f["start"] is not None]
    for f in durations:
        if _is_quarter(_days(f["start"], f["end"])):
            quarters[f["end"]] = f["val"]
    by_start: dict[str, list[dict]] = {}
    for f in durations:
        by_start.setdefault(f["start"], []).append(f)
    for f in durations:
        if _days(f["start"], f["end"]) <= 100 or f["end"] in quarters:
            continue
        shorter = next((g for g in by_start[f["start"]] if _is_quarter(_days(g["end"], f["end"]))), None)
        if shorter is not None:
            quarters[f["end"]] = f["val"] - shorter["val"]
    # A fourth quarter without nine months to subtract: the year less its other three quarters.
    for f in durations:
        if not _is_year(f) or f["end"] in quarters:
            continue
        inside = [(end, value) for end, value in quarters.items() if f["start"] < end < f["end"]]
        if len(inside) == 3:
            rest = f["val"]
            for _, value in inside:
                rest = rest - value
            quarters[f["end"]] = rest
    return quarters


def _line_of(taxonomy: Mapping[str, Any], concepts: list[str], unit: str, prefer: bool = False) -> dict:
    """
    One line of the statements, from the first tag that has a value for each
    period. `prefer` puts the tag with the most recent data first, so a
    company that switched tags years ago reads its current one.
    """
    per_concept = [facts for facts in (_facts_of(taxonomy, c, unit) for c in concepts) if facts]
    if prefer:

        def latest(facts: list[dict]) -> str:
            return max((f["end"] for f in facts), default="")

        def last_year(facts: list[dict]) -> float:
            years = [f for f in facts if _is_year(f)]
            return max(years, key=lambda f: f["end"])["val"] if years else 0

        # Equally recent tags: the larger one, as a company may also tag a part
        # (American Tower's revenue from contracts leaves out its tower leases).
        per_concept.sort(key=lambda facts: (latest(facts), last_year(facts)), reverse=True)
    line = {"years": {}, "quarters": {}, "instants": {}, "filed": ""}
    for facts in per_concept:
        for f in facts:
            if f["filed"] > line["filed"]:
                line["filed"] = f["filed"]
            if f["start"] is None:
                line["instants"].setdefault(f["end"], f["val"])
            elif _is_year(f) and f["end"] not in line["years"]:
                line["years"][f["end"]] = f
        for end, value in _quarters_of(facts).items():
            line["quarters"].setdefault(end, value)
    return line


def _year_value(line: dict, end: str) -> float | None:
    f = line["years"].get(end)
    return f["val"] if f else None


def _difference(a: float | None, b: float | None) -> float | None:
    return None if a is None or b is None else a - b


def _round4(v: float | None) -> float | None:
    """Math.round(v * 1e4) / 1e4, as JavaScript rounds."""
    return None if v is None else math.floor(v * 1e4 + 0.5) / 1e4


def parse_company_facts(data: Any) -> dict[str, Any] | None:
    """The company's numbers, or None if it reports none in US dollars (no revenue or earnings found)."""
    if not isinstance(data, dict):
        return None
    facts = data.get("facts")
    if not isinstance(facts, dict) or not facts:
        return None
    taxonomy = "us-gaap" if facts.get("us-gaap") else "ifrs-full"
    tags = facts.get(taxonomy)
    if not tags:
        return None

    def of(concepts: dict, unit: str = "USD", prefer: bool = False) -> dict:
        return _line_of(tags, concepts.get(taxonomy, []), unit, prefer)

    revenue = of(REVENUE, "USD", True)
    net_income = of(NET_INCOME)
    anchor = revenue if revenue["years"] else net_income
    if not anchor["years"]:
        return None
    cost = of(COST_OF_REVENUE)
    gross_profit = of(GROSS_PROFIT)
    operating_income = of(OPERATING_INCOME)
    eps = of(EPS, "USD/shares")
    shares = of(DILUTED_SHARES, "shares")
    equity = of(EQUITY)
    cash_flow = of(OPERATING_CASH_FLOW)
    capex = of(CAPITAL_SPENDING)

    years = []
    for f in sorted(anchor["years"].values(), key=lambda f: f["end"])[-YEARS:]:
        end = f["end"]
        rev = _year_value(revenue, end)
        ocf = _year_value(cash_flow, end)
        spent = _year_value(capex, end)
        reported_gross = _year_value(gross_profit, end)
        years.append(
            {
                "start": f["start"],
                "end": end,
                "revenue": rev,
                "grossProfit": reported_gross if reported_gross is not None else _difference(rev, _year_value(cost, end)),
                "operatingIncome": _year_value(operating_income, end),
                "netIncome": _year_value(net_income, end),
                "eps": _year_value(eps, end),
                "dilutedShares": _year_value(shares, end),
                "equity": equity["instants"].get(end),
                "operatingCashFlow": ocf,
                "capitalSpending": spent,
                "freeCashFlow": _difference(ocf, spent),
            }
        )

    filed = max((line["filed"] for line in (revenue, net_income, eps, equity, cash_flow)), default="")
    cik = data.get("cik")
    if not _is_number(cik):
        try:
            cik = int(cik)
        except (TypeError, ValueError):
            cik = 0
    name = data.get("entityName")
    lines = {"revenue": revenue, "grossProfit": gross_profit, "cost": cost, "operatingIncome": operating_income, "netIncome": net_income, "eps": eps}
    return {"cik": cik or 0, "name": name if isinstance(name, str) else "", "years": years, "trailing": _trailing_of(years[-1], anchor, lines), "filed": filed}


def _trailing_of(last_year: dict, anchor: dict, lines: dict[str, dict]) -> dict:
    """The last four quarters, if they run on from each other and end after the last fiscal year; otherwise that year."""
    year_only = {k: last_year[k] for k in ("end", "revenue", "grossProfit", "operatingIncome", "netIncome", "eps")}
    ends = sorted(anchor["quarters"])[-4:]
    if len(ends) < 4 or ends[3] <= last_year["end"]:
        return year_only
    for i in range(1, 4):
        gap = _days(ends[i - 1], ends[i])
        if gap < 75 or gap > 105:
            return year_only

    def total(line: dict) -> float | None:
        out = 0.0
        for end in ends:
            if end not in line["quarters"]:
                return None
            out = out + line["quarters"][end]
        return out

    rev = total(lines["revenue"])
    gross = total(lines["grossProfit"])
    return {
        "end": ends[3],
        "revenue": rev,
        "grossProfit": gross if gross is not None else _difference(rev, total(lines["cost"])),
        "operatingIncome": total(lines["operatingIncome"]),
        "netIncome": total(lines["netIncome"]),
        # Quarterly figures are in cents, so the sum is too (without float noise like 8.709999).
        "eps": _round4(total(lines["eps"])),
    }


# --- Fetching ------------------------------------------------------------------


class FetchError(RuntimeError):
    """The SEC couldn't be reached, or answered with an error other than 'no such file'."""


def fetch_company_facts(cik: int, user_agent: str, client: httpx.Client | None = None) -> dict[str, Any] | None:
    """
    A company's numbers, straight from the SEC, parsed; None when it files
    nothing in XBRL (no facts file) or reports nothing in US dollars. The
    SEC asks every request to name who's asking (`user_agent`).
    """
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
    own = client is None
    client = client or httpx.Client(timeout=15)
    try:
        response = client.get(url, headers={"User-Agent": user_agent, "Accept": "application/json"})
    except httpx.HTTPError as error:
        raise FetchError(f"The SEC couldn't be reached: {error}") from error
    finally:
        if own:
            client.close()
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise FetchError(f"The SEC answered HTTP {response.status_code}")
    return parse_company_facts(response.json())


# --- Ratios at a price -------------------------------------------------------------

DAY_MS = 86_400_000
#: Numbers this old (by their latest period) are left out of comparisons: the company has stopped reporting in dollars, or at all.
CURRENT_FOR_MS = 15 * 31 * DAY_MS


def _iso_ms(day: str) -> int:
    return int((date.fromisoformat(day) - date(1970, 1, 1)).days * DAY_MS)


def is_current(facts: Mapping[str, Any], now_ms: int) -> bool:
    end = (facts.get("trailing") or {}).get("end") or ((facts.get("years") or [{}])[-1] or {}).get("end")
    return bool(end) and _iso_ms(end) > now_ms - CURRENT_FOR_MS


def _ratio(a: float | None, b: float | None) -> float | None:
    return None if a is None or b is None or b == 0 else a / b


def _growth(now: float | None, before: float | None) -> float | None:
    return None if now is None or before is None or before <= 0 else now / before - 1


def ratios_of(facts: Mapping[str, Any], price: float, market_cap: float | None) -> dict[str, float | None]:
    """Ratios from the reported numbers and a price. Without a market value, it's the price times the diluted shares."""
    years = facts.get("years") or []
    last = years[-1] if years else None
    before = years[-2] if len(years) >= 2 else None
    t = facts.get("trailing")
    g = lambda d, k: d.get(k) if d else None  # noqa: E731
    shares = g(last, "dilutedShares")
    value = market_cap if market_cap is not None else (price * shares if shares else None)
    equity = g(last, "equity")
    if market_cap is not None:
        income = g(t, "netIncome")
        pe = market_cap / income if income and income > 0 else None
    else:
        eps = g(t, "eps")
        pe = price / eps if eps and eps > 0 else None
    return {
        "revenueGrowth": _growth(g(last, "revenue"), g(before, "revenue")),
        "epsGrowth": _growth(g(last, "eps"), g(before, "eps")),
        "grossMargin": _ratio(g(t, "grossProfit"), g(t, "revenue")),
        "operatingMargin": _ratio(g(t, "operatingIncome"), g(t, "revenue")),
        "netMargin": _ratio(g(t, "netIncome"), g(t, "revenue")),
        "returnOnEquity": _ratio(g(last, "netIncome"), equity) if equity and equity > 0 else None,
        # By value rather than per share where possible: per-share figures don't
        # match the traded share for depositary receipts (TSM) or share classes (BRK-B).
        "peRatio": pe,
        "priceToSales": _ratio(value, g(t, "revenue")),
        "freeCashFlowYield": _ratio(g(last, "freeCashFlow"), value),
    }
