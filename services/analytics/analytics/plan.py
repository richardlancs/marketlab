"""
The goal planner: the portfolio's projection (portfolio.py's Monte Carlo)
with money going in or out each month, a target, and inflation.

Each path draws whole 21-session blocks of the portfolio's own past daily
returns, as the projection does (a block bootstrap keeps calm and stormy
stretches together), compounds them a month at a time, and adds the
monthly contribution (or takes the withdrawal) at each month's end. A path
whose money runs out stays at zero. With inflation on, contributions and
withdrawals rise with prices each year, and every amount shown is in
today's dollars, so a target means the same spending power at the end.

Seeded by the inputs, so the same plan always gives the same picture. It's
a range of outcomes the portfolio's own history could produce, not a
forecast: the future can be calmer or wilder than the past few years.
"""

from __future__ import annotations

import hashlib
import math
from collections.abc import Mapping
from typing import Any

import numpy as np
import pandas as pd

from .portfolio import MC_BLOCK, TRADING_DAYS, _n, _returns

PATHS = 2000
MONTH = TRADING_DAYS // 12
MAX_YEARS = 40
#: Yearly inflation when it's on: about the long-run US average.
INFLATION = 0.025


def plan(
    bars: Mapping[str, pd.DataFrame],
    holdings: Mapping[str, float],
    cash: float,
    *,
    monthly: float,
    years: int,
    target: float | None,
    inflation: bool,
    seed_text: str,
) -> dict[str, Any]:
    if not 1 <= years <= MAX_YEARS:
        raise ValueError(f"Plan between 1 and {MAX_YEARS} years.")
    symbols = [s for s, v in holdings.items() if v > 0 and s in bars and len(bars[s]) >= 60]
    invested = float(sum(holdings[s] for s in symbols))
    start = invested + max(cash, 0.0)
    if start <= 0 and monthly <= 0:
        raise ValueError("There's nothing to plan with: no holdings, cash or monthly contributions.")
    # The portfolio's daily returns at today's weights (cash earns nothing); all cash, or nothing yet, never moves.
    if symbols and start > 0:
        w = np.array([holdings[s] / start for s in symbols])
        history = _returns(bars, symbols, 3 * TRADING_DAYS).to_numpy() @ w
    else:
        history = np.zeros(MC_BLOCK + 1)

    rng = np.random.default_rng(int(hashlib.sha256(seed_text.encode()).hexdigest()[:16], 16))
    months = years * 12
    days = months * MONTH
    blocks = math.ceil(days / MC_BLOCK)
    starts = rng.integers(0, max(1, len(history) - MC_BLOCK), size=(PATHS, blocks))
    daily = history[np.minimum(starts[:, :, None] + np.arange(MC_BLOCK), len(history) - 1)].reshape(PATHS, -1)[:, :days]
    monthly_growth = np.prod(1 + daily.reshape(PATHS, months, MONTH), axis=2)

    # Each month's flow in that month's dollars: rising with inflation each year when it's on.
    month_index = np.arange(1, months + 1)
    price_level = (1 + INFLATION) ** (month_index / 12) if inflation else np.ones(months)
    flows = monthly * ((1 + INFLATION) ** ((month_index - 1) // 12) if inflation else np.ones(months))

    wealth = np.empty((PATHS, months))
    value = np.full(PATHS, start, dtype=float)
    ran_out = np.full(PATHS, -1)
    for m in range(months):
        value = value * monthly_growth[:, m] + flows[m]
        broke = (value <= 0) & (ran_out < 0)
        ran_out[broke] = m + 1
        value = np.maximum(value, 0.0)
        wealth[:, m] = value
    real = wealth / price_level  # today's dollars (the same as nominal without inflation)

    final = real[:, -1]
    bands = np.percentile(real, [10, 25, 50, 75, 90], axis=0)
    out_of_money = ran_out > 0
    contributed = float(np.sum(flows / price_level))
    return {
        "paths": PATHS,
        "years": years,
        "historySessions": int(len(history)),
        "start": _n(start, 2),
        "monthly": _n(monthly, 2),
        "inflation": INFLATION if inflation else None,
        "months": month_index.tolist(),
        "bands": {p: [_n(v, 2) for v in row] for p, row in zip(["p10", "p25", "p50", "p75", "p90"], bands)},
        "final": {"p10": _n(np.percentile(final, 10), 2), "median": _n(np.median(final), 2), "p90": _n(np.percentile(final, 90), 2)},
        "contributed": _n(contributed, 2),
        "target": _n(target, 2) if target else None,
        "targetProbability": _n(float(np.mean(final >= target)), 4) if target else None,
        "runOutProbability": _n(float(np.mean(out_of_money)), 4),
        "runOutMedianMonths": int(np.median(ran_out[out_of_money])) if out_of_money.any() else None,
    }
