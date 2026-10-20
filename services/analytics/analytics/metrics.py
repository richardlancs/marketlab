"""
Performance metrics from the measured sessions' portfolio values, as the
TypeScript engine computes them (lib/backtest/engine.ts computeMetrics):

- total return, and CAGR over calendar time (365.25-day years);
- the largest fall from a running peak, with its peak and trough dates;
- volatility: the sample standard deviation of daily returns x sqrt(252);
- Sharpe ratio: mean daily return / its standard deviation x sqrt(252), with
  a 0% risk-free rate; None when the values never vary;
- exposure: the share of sessions with money invested.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

TRADING_DAYS_PER_YEAR = 252
YEAR_MS = 365.25 * 24 * 60 * 60 * 1000


@dataclass(frozen=True)
class Metrics:
    final_value: float
    total_return: float
    cagr: float
    max_drawdown: float
    drawdown_peak: int | None
    drawdown_trough: int | None
    volatility: float
    sharpe: float | None
    trades: int
    exposure: float


def _sequential_sum(values: Sequence[float]) -> float:
    total = 0.0
    for v in values:
        total = total + v
    return total


def compute_metrics(equity: Sequence[tuple[int, float]], trades: int, exposure: float) -> Metrics:
    first = equity[0][1]
    last = equity[-1][1]
    years = (equity[-1][0] - equity[0][0]) / YEAR_MS

    returns = [equity[i + 1][1] / equity[i][1] - 1 for i in range(len(equity) - 1)]
    mean = _sequential_sum(returns) / len(returns)
    variance = 0.0
    if len(returns) > 1:
        squares = 0.0
        for r in returns:
            squares = squares + (r - mean) ** 2
        variance = squares / (len(returns) - 1)
    sd = math.sqrt(variance)

    peak = equity[0]
    max_drawdown = 0.0
    drawdown_peak: int | None = None
    drawdown_trough: int | None = None
    for point in equity:
        if point[1] > peak[1]:
            peak = point
        drawdown = 1 - point[1] / peak[1]
        if drawdown > max_drawdown:
            max_drawdown = drawdown
            drawdown_peak = peak[0]
            drawdown_trough = point[0]

    return Metrics(
        final_value=last,
        total_return=last / first - 1,
        cagr=(last / first) ** (1 / years) - 1 if years > 0 else 0.0,
        max_drawdown=max_drawdown,
        drawdown_peak=drawdown_peak,
        drawdown_trough=drawdown_trough,
        volatility=sd * math.sqrt(TRADING_DAYS_PER_YEAR),
        sharpe=(mean / sd) * math.sqrt(TRADING_DAYS_PER_YEAR) if sd > 1e-12 else None,
        trades=trades,
        exposure=exposure,
    )
