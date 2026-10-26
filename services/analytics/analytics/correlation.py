"""
How a set of stocks move together, from a year of daily returns: their
correlations, an order that puts similar stocks side by side, the closest
pairs, and how many independent bets they amount to.

- Order: hierarchical clustering (SciPy, average linkage) on the distance
  1 - correlation, read off the tree's leaves, so stocks that move alike
  sit next to each other in the heatmap.
- Effective number of bets: (Σλ)² / Σλ² over the correlation matrix's
  eigenvalues λ. N stocks that all move in lockstep count as 1; N that
  don't move together at all count as N. Weights aren't considered: it
  describes the stocks, not how much of each is held.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import leaves_list, linkage
from scipy.spatial.distance import squareform

CLOSEST = 3


def _n(value: float, digits: int) -> float | None:
    return round(float(value), digits) if math.isfinite(value) else None


def cluster_order(corr: np.ndarray) -> list[int]:
    """Row order that keeps similar stocks together (as listed when there are fewer than three)."""
    n = len(corr)
    if n < 3:
        return list(range(n))
    distance = np.clip(1 - corr, 0, 2)
    np.fill_diagonal(distance, 0)
    distance = (distance + distance.T) / 2
    return [int(i) for i in leaves_list(linkage(squareform(distance, checks=False), method="average", optimal_ordering=True))]


def effective_bets(corr: np.ndarray) -> float:
    eigenvalues = np.clip(np.linalg.eigvalsh(corr), 0, None)
    return float(eigenvalues.sum() ** 2 / (eigenvalues**2).sum())


def summary(returns: pd.DataFrame) -> dict[str, Any]:
    """The correlation matrix (as listed), a clustered order, the closest pairs and the effective number of bets."""
    corr = returns.corr().to_numpy()
    corr = np.nan_to_num(corr, nan=0.0)
    np.fill_diagonal(corr, 1.0)
    symbols = list(returns.columns)
    pairs = sorted(((corr[i, j], i, j) for i in range(len(symbols)) for j in range(i + 1, len(symbols))), key=lambda p: -p[0])
    return {
        "correlation": [[_n(c, 3) for c in row] for row in corr],
        "order": cluster_order(corr),
        "effectiveBets": _n(effective_bets(corr), 2),
        "closest": [{"a": symbols[i], "b": symbols[j], "correlation": _n(c, 3)} for c, i, j in pairs[:CLOSEST]],
        "sessions": int(len(returns)),
    }
