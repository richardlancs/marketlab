"""
How much to trust the best of many tries.

Trying many settings and keeping the best one finds luck as well as skill:
even with no real edge, the best of 100 tries looks good. The Deflated
Sharpe Ratio (Bailey and López de Prado, 2014) asks how likely the best
Sharpe ratio is to be above zero once you allow for how many were tried and
how much they varied.

Simplifications: daily returns are treated as normal (no skew or fat
tails), and every try counts as independent. Neighbouring settings are
correlated, so this is a rough guide in the right direction, not a test.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

from scipy.stats import norm

EULER_GAMMA = 0.5772156649015329
TRADING_DAYS = 252


def selection_check(sharpes: Sequence[float | None], sessions: int) -> dict[str, Any] | None:
    """
    `sharpes` are the annualised Sharpe ratios of every try; `sessions` how
    many trading days each run covered. None with fewer than two usable tries.
    """
    values = [s for s in sharpes if s is not None and math.isfinite(s)]
    n = len(values)
    if n < 2 or sessions < 3:
        return None
    per_day = [s / math.sqrt(TRADING_DAYS) for s in values]
    mean = sum(per_day) / n
    variance = sum((v - mean) ** 2 for v in per_day) / (n - 1)
    best = max(per_day)
    # The expected maximum of n draws from a normal with that spread, centred on zero (no skill).
    expected = math.sqrt(variance) * ((1 - EULER_GAMMA) * norm.ppf(1 - 1 / n) + EULER_GAMMA * norm.ppf(1 - 1 / (n * math.e)))
    z = (best - expected) * math.sqrt(sessions - 1) / math.sqrt(1 + 0.5 * best * best)
    return {
        "trials": n,
        "best": best * math.sqrt(TRADING_DAYS),
        "expectedByLuck": float(expected) * math.sqrt(TRADING_DAYS),
        "probability": float(norm.cdf(z)),
    }
