"""How stocks move together (analytics/correlation.py): the matrix, the clusters and the effective number of bets."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from analytics import correlation


def two_sectors(seed: int = 0, days: int = 252) -> pd.DataFrame:
    """Six stocks: three driven by one sector's moves, three by another's, listed alternately."""
    rng = np.random.default_rng(seed)
    tech, banks = rng.normal(0, 0.02, days), rng.normal(0, 0.02, days)
    columns = {}
    for i in range(3):
        columns[f"T{i}"] = tech + rng.normal(0, 0.005, days)
        columns[f"B{i}"] = banks + rng.normal(0, 0.005, days)
    return pd.DataFrame(columns)


def test_the_matrix_is_symmetric_with_ones_on_the_diagonal():
    corr = np.array(correlation.summary(two_sectors())["correlation"])
    assert np.allclose(corr, corr.T) and np.allclose(np.diag(corr), 1)


def test_the_order_puts_each_sector_together():
    result = correlation.summary(two_sectors())
    names = [list(two_sectors().columns)[i] for i in result["order"]]
    sectors = [n[0] for n in names]
    # One block of one sector, then one of the other.
    assert sectors in (["T"] * 3 + ["B"] * 3, ["B"] * 3 + ["T"] * 3)


def test_effective_bets_counts_independent_moves():
    rng = np.random.default_rng(1)
    same = rng.normal(0, 0.01, 252)
    lockstep = pd.DataFrame({f"S{i}": same + rng.normal(0, 1e-5, 252) for i in range(5)})
    independent = pd.DataFrame({f"S{i}": rng.normal(0, 0.01, 2000) for i in range(5)})
    assert correlation.summary(lockstep)["effectiveBets"] == pytest.approx(1, abs=0.05)
    assert correlation.summary(independent)["effectiveBets"] == pytest.approx(5, abs=0.3)
    assert correlation.summary(two_sectors())["effectiveBets"] == pytest.approx(2, abs=0.3)


def test_names_the_closest_pairs_first():
    closest = correlation.summary(two_sectors())["closest"]
    assert len(closest) == 3
    assert all(p["a"][0] == p["b"][0] for p in closest)  # same sector
    assert closest[0]["correlation"] >= closest[1]["correlation"] >= closest[2]["correlation"]
