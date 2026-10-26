"""
More measures of a finished backtest, from its equity curve and trades, and
its returns by calendar month and year (the heatmap under the results).
Pure arithmetic on a result, so it works the same for fresh, saved and
shared runs.

- Sortino: mean daily return / downside deviation (losses only, target 0) × √252.
- Calmar: annual return (CAGR) / maximum drawdown.
- Beta, alpha, correlation: daily returns regressed on the benchmark's
  (alpha annualised: (mean − beta × benchmark mean) × 252).
- Tracking error: the standard deviation of the daily difference from the
  benchmark × √252; information ratio: that difference's mean × 252 / tracking error.
- Trades: a "round trip" is a stock bought from nothing and sold back to
  nothing. Its result is what the sells brought in (after costs) against
  what the buys cost (with costs). Win rate counts round trips that made money.
- Turnover: everything bought and sold, per year, as a multiple of the average value.
- Costs: commissions, plus slippage (the gap between each fill and that day's close).

Sums run left to right, one number at a time, as MarketLab's TypeScript did
before these moved here (tests/fixtures/analysis.json holds its results).
Inputs are results as JSON: equity [{time, price}], trades [{time, symbol,
side, shares, price, commission}], metrics {cagr, maxDrawdown, ...}.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

DAYS_PER_YEAR = 252
YEAR_MS = 365.25 * 24 * 60 * 60 * 1000


def _sum(xs: Sequence[float]) -> float:
    total = 0.0
    for x in xs:
        total = total + x
    return total


def _mean(xs: Sequence[float]) -> float:
    return _sum(xs) / len(xs)


def _variance(xs: Sequence[float], m: float | None = None) -> float:
    m = _mean(xs) if m is None else m
    return _sum([(x - m) ** 2 for x in xs]) / (len(xs) - 1)


def analyse_run(run: Mapping[str, Any], benchmark: Mapping[str, Any], costs: Mapping[str, Any]) -> dict[str, Any]:
    equity = run["equity"]
    r = [equity[i + 1]["price"] / equity[i]["price"] - 1 for i in range(len(equity) - 1)]
    enough = len(r) >= 2
    downside = math.sqrt(_mean([min(x, 0) ** 2 for x in r])) if enough else 0.0
    sortino = (_mean(r) / downside) * math.sqrt(DAYS_PER_YEAR) if enough and downside > 1e-12 else None
    metrics = run["metrics"]
    calmar = metrics["cagr"] / metrics["maxDrawdown"] if metrics["maxDrawdown"] > 1e-9 else None

    # Against the benchmark, on the days both have (they're run over the same days).
    benchmark_at = {p["time"]: p["price"] for p in benchmark["equity"]}
    pairs: list[tuple[float, float]] = []
    for i in range(1, len(equity)):
        b0 = benchmark_at.get(equity[i - 1]["time"])
        b1 = benchmark_at.get(equity[i]["time"])
        if b0 is not None and b1 is not None:
            pairs.append((equity[i]["price"] / equity[i - 1]["price"] - 1, b1 / b0 - 1))
    beta = alpha = correlation = tracking_error = information_ratio = None
    if len(pairs) >= 2:
        a = [p[0] for p in pairs]
        b = [p[1] for p in pairs]
        ma, mb = _mean(a), _mean(b)
        cov = _sum([(x - ma) * (y - mb) for x, y in pairs]) / (len(pairs) - 1)
        va, vb = _variance(a, ma), _variance(b, mb)
        if vb > 1e-18:
            beta = cov / vb
            alpha = (ma - beta * mb) * DAYS_PER_YEAR
        if va > 1e-18 and vb > 1e-18:
            correlation = cov / math.sqrt(va * vb)
        active = [x - y for x, y in pairs]
        te = math.sqrt(_variance(active)) * math.sqrt(DAYS_PER_YEAR)
        if te > 1e-9:
            tracking_error = te
            information_ratio = (_mean(active) * DAYS_PER_YEAR) / te

    # Round trips, per stock: from the first buy while holding nothing to the sell that empties it.
    slip = costs["slippageBps"] / 10_000
    positions: dict[str, dict[str, float]] = {}
    results: list[tuple[float, float]] = []
    traded = slippage = commissions = 0.0
    for t in run["trades"]:
        value = t["shares"] * t["price"]
        traded += value
        commissions += t["commission"]
        # The close was price / (1 ± slippage); the gap, times the shares, is what slippage cost.
        slippage += value - value / (1 + slip) if t["side"] == "buy" else value / (1 - slip) - value
        position = positions.get(t["symbol"]) or {"shares": 0.0, "spent": 0.0, "received": 0.0, "since": t["time"]}
        if position["shares"] <= 1e-9:
            position.update(shares=0.0, spent=0.0, received=0.0, since=t["time"])
        if t["side"] == "buy":
            position["shares"] += t["shares"]
            position["spent"] += value + t["commission"]
        else:
            position["shares"] -= t["shares"]
            position["received"] += value - t["commission"]
            if position["shares"] <= 1e-9:
                results.append((position["received"] - position["spent"], (t["time"] - position["since"]) / 86_400_000))
        positions[t["symbol"]] = position
    gains = [p for p, _ in results if p > 0]
    losses = [p for p, _ in results if p <= 0]
    years = (equity[-1]["time"] - equity[0]["time"]) / YEAR_MS if len(equity) > 1 else 0
    average_value = _mean([p["price"] for p in equity])
    return {
        "sortino": sortino,
        "calmar": calmar,
        "beta": beta,
        "alpha": alpha,
        "correlation": correlation,
        "trackingError": tracking_error,
        "informationRatio": information_ratio,
        "roundTrips": len(results),
        "winRate": len(gains) / len(results) if results else None,
        "averageGain": _mean(gains) if gains else None,
        "averageLoss": _mean(losses) if losses else None,
        "averageHoldingDays": _mean([d for _, d in results]) if results else None,
        "turnover": traded / average_value / years if years > 0 and average_value > 0 else None,
        "commissions": commissions,
        "slippage": slippage,
    }


def _month_of(time_ms: int) -> tuple[int, int]:
    d = datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc)
    return d.year, d.month - 1


def period_returns(equity: Sequence[Mapping[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """
    Each month's return: its last value over the previous month's last value,
    minus 1. The first month is measured from the run's first day instead, so
    it (and a last month that hasn't ended) is marked partial. A year compounds
    its months: (1 + r1) × (1 + r2) × … − 1. Months are 0-based (0 = January).
    """
    if len(equity) < 2:
        return {"months": [], "years": []}
    months: list[dict[str, Any]] = []
    base = equity[0]["price"]
    for i, point in enumerate(equity):
        year, month = _month_of(point["time"])
        nxt = equity[i + 1] if i + 1 < len(equity) else None
        if nxt is not None and _month_of(nxt["time"]) == (year, month):
            continue
        months.append({"year": year, "month": month, "value": point["price"] / base - 1, "partial": len(months) == 0 or nxt is None})
        base = point["price"]
    years: list[dict[str, Any]] = []
    for m in months:
        if years and years[-1]["year"] == m["year"]:
            years[-1]["value"] = (1 + years[-1]["value"]) * (1 + m["value"]) - 1
            years[-1]["partial"] = years[-1]["partial"] or m["partial"]
        else:
            years.append({"year": m["year"], "value": m["value"], "partial": m["partial"]})
    # A year the run doesn't cover from January to December is partial too.
    for y in years:
        if sum(1 for m in months if m["year"] == y["year"]) < 12:
            y["partial"] = True
    return {"months": months, "years": years}


def extras(run: Mapping[str, Any], benchmark: Mapping[str, Any], costs: Mapping[str, Any], alternative: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """
    What the results page shows beyond the run itself: the measures above and
    both curves' period returns; and for an optimised run, the equal-weight
    run it's compared with (engine.py Outcome.alternative): its values and metrics.
    """
    out: dict[str, Any] = {"analysis": analyse_run(run, benchmark, costs), "periods": {"run": period_returns(run["equity"]), "benchmark": period_returns(benchmark["equity"])}}
    if alternative is not None:
        out["alternative"] = {"label": "Equal weights", "equity": [{"time": p["time"], "price": round(p["price"], 2)} for p in alternative["equity"]], "metrics": alternative["metrics"]}
    return out
