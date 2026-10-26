"""
Long-only portfolio optimisation, shared by the portfolio page's "other
weightings" (portfolio.py) and the backtester's optimised strategy
(strategies.py Optimised).

Raw estimates make optimisers chase noise, so both use toned-down inputs:
expected returns pulled halfway to their average (shrink_returns) and
correlations a quarter of the way to theirs (shrunk_covariance).
"""

from __future__ import annotations

import math
from typing import Any, Callable

import numpy as np
import pandas as pd
from scipy.optimize import minimize

TRADING_DAYS = 252


def _n(value: Any, digits: int = 6) -> float | None:
    if value is None:
        return None
    value = float(value)
    return round(value, digits) if math.isfinite(value) else None


def shrink_returns(returns: pd.DataFrame, weight: float = 0.5) -> np.ndarray:
    """Annualised mean daily returns, each pulled `weight` of the way to their average."""
    raw = returns.mean().to_numpy() * TRADING_DAYS
    return (1 - weight) * raw + weight * raw.mean()


def shrunk_covariance(returns: pd.DataFrame, weight: float = 0.25) -> np.ndarray:
    """Sample covariance, with correlations pulled `weight` of the way to their average (constant-correlation shrinkage)."""
    sample = returns.cov().to_numpy() * TRADING_DAYS
    sd = np.sqrt(np.diag(sample))
    corr = sample / np.outer(sd, sd)
    n = len(sd)
    average = (corr.sum() - n) / (n * (n - 1)) if n > 1 else 0.0
    target = np.full((n, n), average)
    np.fill_diagonal(target, 1.0)
    return np.outer(sd, sd) * ((1 - weight) * corr + weight * target)


def default_cap(n: int) -> float:
    """
    At most 40% in one stock; with two stocks, 80% (40% would force them
    equal, and just over half would leave nothing to choose).
    """
    return 0.8 if n == 2 else max(0.4, 1 / n + 1e-6)


def _solver(n: int, cap: float) -> Callable[..., np.ndarray]:
    bounds = [(0.0, cap)] * n
    budget = {"type": "eq", "fun": lambda w: np.sum(w) - 1}
    start = np.full(n, 1 / n)

    def solve(objective, constraints=(budget,), x0=start):
        result = minimize(objective, x0, method="SLSQP", bounds=bounds, constraints=constraints, options={"maxiter": 300, "ftol": 1e-12})
        w = np.clip(result.x, 0, cap)
        return w / w.sum()

    return solve


def minimum_variance(cov: np.ndarray, cap: float) -> np.ndarray:
    return _solver(len(cov), cap)(lambda w: float(w @ cov @ w))


def maximum_sharpe(mu: np.ndarray, cov: np.ndarray, cap: float) -> np.ndarray:
    return _solver(len(mu), cap)(lambda w: -(w @ mu) / math.sqrt(max(float(w @ cov @ w), 1e-18)))


def optimise(mu: np.ndarray, cov: np.ndarray, cap: float) -> dict[str, Any]:
    """Long-only weights summing to 1, each at most `cap`: minimum variance, maximum Sharpe, risk parity, and the frontier."""
    n = len(mu)
    budget = {"type": "eq", "fun": lambda w: np.sum(w) - 1}
    solve = _solver(n, cap)
    variance = lambda w: float(w @ cov @ w)  # noqa: E731

    def describe(w: np.ndarray) -> dict[str, Any]:
        vol = math.sqrt(variance(w))
        ret = float(w @ mu)
        return {"weights": [_n(x, 4) for x in w], "expectedReturn": _n(ret), "volatility": _n(vol), "sharpe": _n(ret / vol if vol > 0 else None, 4)}

    min_var = minimum_variance(cov, cap)
    max_sharpe = maximum_sharpe(mu, cov, cap)

    def parity_gap(w):
        contributions = w * (cov @ w)
        total = contributions.sum()
        return float(np.sum((contributions / total - 1 / n) ** 2)) if total > 0 else 1.0

    parity = solve(parity_gap, x0=(1 / np.sqrt(np.diag(cov))) / np.sum(1 / np.sqrt(np.diag(cov))))

    # The frontier: the least risk for each target return from the minimum-variance portfolio's up to the best achievable.
    best = solve(lambda w: -(w @ mu))
    low, high = float(min_var @ mu), float(best @ mu)
    frontier = []
    for target in np.linspace(low, high, 15) if high > low + 1e-9 else [low]:
        w = solve(variance, constraints=(budget, {"type": "eq", "fun": lambda w, t=target: w @ mu - t}), x0=min_var)
        frontier.append({"expectedReturn": _n(float(w @ mu)), "volatility": _n(math.sqrt(variance(w)))})
    return {"minimumVariance": describe(min_var), "maximumSharpe": describe(max_sharpe), "riskParity": describe(parity), "frontier": frontier, "describe": describe}
