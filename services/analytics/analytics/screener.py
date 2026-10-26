"""
The stock screener's rows: every catalog stock's stored profile (profiles.py)
and price-store numbers, with ratios from its SEC company numbers at the
latest close (fundamentals.py), and percentile ranks of momentum and
volatility. The browser filters, sorts and applies presets to these rows
(lib/analytics/screener.ts), which keeps that instant.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from . import fundamentals
from .db import Database


def percentiles(values: Sequence[float | None]) -> list[float | None]:
    """Fractions of 0 to 1: where each value sits among the others (ties share the average rank). Nones stay None."""
    present = sorted(((v, i) for i, v in enumerate(values) if v is not None), key=lambda x: x[0])
    out: list[float | None] = [None] * len(values)
    if not present:
        return out
    if len(present) == 1:
        out[present[0][1]] = 0.5
        return out
    start = 0
    while start < len(present):
        end = start
        while end + 1 < len(present) and present[end + 1][0] == present[start][0]:
            end += 1
        rank = (start + end) / 2 / (len(present) - 1)
        for k in range(start, end + 1):
            out[present[k][1]] = rank
        start = end + 1
    return out


def build_rows(inputs: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Rows from {symbol, name, sector, profile, marketCap, peRatio, dividendYield, facts} inputs."""
    rows = []
    for x in inputs:
        p = x["profile"]
        r = fundamentals.ratios_of(x["facts"], p["price"], x["marketCap"]) if x.get("facts") else None
        rows.append(
            {
                "symbol": x["symbol"],
                "name": x["name"],
                "sector": x["sector"],
                "price": p["price"],
                "marketCap": x["marketCap"],
                # With reported earnings, a loss means no P/E rather than the source's figure.
                "peRatio": r["peRatio"] if r else x["peRatio"],
                "dividendYield": x["dividendYield"] if x["dividendYield"] is not None else p["income"]["dividendYield"],
                "priceToSales": r["priceToSales"] if r else None,
                "revenueGrowth": r["revenueGrowth"] if r else None,
                "netMargin": r["netMargin"] if r else None,
                "returnOnEquity": r["returnOnEquity"] if r else None,
                "freeCashFlowYield": r["freeCashFlowYield"] if r else None,
                "r1M": p["returns"]["1M"],
                "r3M": p["returns"]["3M"],
                "r1Y": p["returns"]["1Y"],
                "momentum": p["returns"]["12-1"],
                "volatility": p["risk"]["volatility1Y"],
                "beta": p["risk"]["beta1Y"],
                "rsi": p["technicals"]["rsi14"],
                "fromHigh": p["risk"]["drawdownFromHigh"],
                "trend": p["technicals"]["states"]["trend"],
                "cross": p["technicals"]["states"]["cross"],
                "momentumRank": None,
                "momentumSectorRank": None,
                "volatilityRank": None,
            }
        )
    for rank, row in zip(percentiles([r["momentum"] for r in rows]), rows):
        row["momentumRank"] = rank
    for rank, row in zip(percentiles([r["volatility"] for r in rows]), rows):
        row["volatilityRank"] = rank
    for sector in dict.fromkeys(r["sector"] for r in rows):
        members = [r for r in rows if r["sector"] == sector]
        for rank, row in zip(percentiles([m["momentum"] for m in members]), members):
            row["momentumSectorRank"] = rank
    return rows


def rows_from_store(db: Database, source: str, catalog: Sequence[Mapping[str, str]], now_ms: int) -> dict[str, Any]:
    """The rows for every catalog stock with a stored profile; SEC numbers more than 15 months old are left out."""
    profiles = {r["subject"]: json.loads(r["result"]) for r in db.query("SELECT subject, result FROM analytics_result WHERE kind = 'stock-profile' AND source = ?", [source])}
    meta = {r["symbol"]: r for r in db.query("SELECT symbol, market_cap, pe_ratio, dividend_yield FROM price_series WHERE source = ?", [source])}
    facts = {r["symbol"]: json.loads(r["data"]) for r in db.query("SELECT symbol, data FROM company_facts WHERE data IS NOT NULL")}
    inputs = []
    for s in catalog:
        p = profiles.get(s["symbol"])
        if p is None:
            continue
        m = meta.get(s["symbol"]) or {}
        f = facts.get(s["symbol"])
        inputs.append(
            {
                **s,
                "profile": p,
                "marketCap": m.get("market_cap"),
                "peRatio": m.get("pe_ratio"),
                "dividendYield": m.get("dividend_yield"),
                "facts": f if f and fundamentals.is_current(f, now_ms) else None,
            }
        )
    rows = build_rows(inputs)
    return {"rows": rows, "asOf": max((p["asOf"] for p in profiles.values()), default=None), "missing": [s["symbol"] for s in catalog if s["symbol"] not in profiles]}
