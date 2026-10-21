"""
Portfolio analytics for one owner's current holdings, from stored daily bars:
what drives its risk, how bad a bad day or a crash could be, what a range of
futures looks like, and how other weightings of the same stocks compare.

Inputs are today's holdings (dollar values) and cash; everything assumes the
weights stay as they are now. Cash earns nothing and never moves.

- Risk: annualised volatility from the last year of daily returns
  (covariance x 252), each holding's share of it (risk contribution:
  w_i x (Sigma w)_i / variance, summing to 100%), the diversification ratio
  (the weighted average of the holdings' own volatilities over the
  portfolio's; above 1 means they partly offset each other), beta against the
  S&P 500, and one-day 95% VaR and expected shortfall.
- Stress tests: the S&P 500's worst drawdowns in the stored history,
  replayed on today's weights (each stock's own return over the same days),
  and hypothetical shocks scaled by each holding's beta.
- Monte Carlo: 2,000 ten-year paths built by drawing whole 21-session blocks
  of the portfolio's own past daily returns (a block bootstrap keeps calm and
  stormy stretches together). Seeded by the inputs, so the same portfolio
  always gets the same picture. Not a forecast.
- Optimisation (SciPy, long-only, weights capped): minimum variance, maximum
  Sharpe ratio (0% risk-free rate) and risk parity (equal risk
  contributions), and the efficient frontier between them. Expected returns
  and covariances are estimated from the last three years and shrunk
  (returns halfway to their average, correlations a quarter of the way to
  their average), because raw estimates make optimisers chase noise.
"""

from __future__ import annotations

import hashlib
import math
from typing import Any, Mapping

import numpy as np
import pandas as pd
from scipy.optimize import minimize

TRADING_DAYS = 252
MC_PATHS = 2000
MC_YEARS = 10
MC_BLOCK = 21
STRESS_EPISODES = 3
HYPOTHETICAL = [
    {"name": "Market falls 10%", "market": -0.10, "sectors": {}},
    {"name": "Market falls 20%", "market": -0.20, "sectors": {}},
    {"name": "A 2008-style crash (market −35%)", "market": -0.35, "sectors": {}},
    {"name": "Tech sell-off (tech −25%, market −5%)", "market": -0.05, "sectors": {"Technology": -0.25, "Semiconductors": -0.25, "Communication Services": -0.15}},
]


def _n(value: Any, digits: int = 6) -> float | None:
    if value is None:
        return None
    value = float(value)
    return round(value, digits) if math.isfinite(value) else None


def _returns(bars: Mapping[str, pd.DataFrame], symbols: list[str], sessions: int) -> pd.DataFrame:
    """Daily simple returns of adjusted closes on the sessions every symbol has, the last `sessions` of them."""
    closes = pd.concat({s: bars[s]["adj_close"] for s in symbols}, axis=1, join="inner").sort_index()
    return closes.pct_change().iloc[1:].iloc[-sessions:]


def drawdown_episodes(prices: pd.Series, count: int, minimum: float = 0.08) -> list[tuple[int, int, float]]:
    """The deepest non-overlapping peak-to-trough falls of at least `minimum`: (peak time, trough time, depth)."""
    values = prices.to_numpy()
    times = prices.index.to_numpy()
    episodes: list[tuple[int, int, float]] = []
    i = 0
    while i < len(values):
        peak = i
        j = i + 1
        trough = i
        # Walk until the price regains the peak (or the data ends), tracking the lowest point.
        while j < len(values) and values[j] < values[peak]:
            if values[j] < values[trough]:
                trough = j
            j += 1
        depth = 1 - values[trough] / values[peak]
        if trough > peak and depth >= minimum:
            episodes.append((int(times[peak]), int(times[trough]), float(depth)))
        i = j if j > i + 1 else i + 1
    episodes.sort(key=lambda e: -e[2])
    return episodes[:count]


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


def optimise(mu: np.ndarray, cov: np.ndarray, cap: float) -> dict[str, Any]:
    """Long-only weights summing to 1, each at most `cap`: minimum variance, maximum Sharpe, risk parity, and the frontier."""
    n = len(mu)
    bounds = [(0.0, cap)] * n
    budget = {"type": "eq", "fun": lambda w: np.sum(w) - 1}
    start = np.full(n, 1 / n)
    variance = lambda w: float(w @ cov @ w)

    def solve(objective, constraints=(budget,), x0=start):
        result = minimize(objective, x0, method="SLSQP", bounds=bounds, constraints=constraints, options={"maxiter": 300, "ftol": 1e-12})
        w = np.clip(result.x, 0, cap)
        return w / w.sum()

    def describe(w: np.ndarray) -> dict[str, Any]:
        vol = math.sqrt(variance(w))
        ret = float(w @ mu)
        return {"weights": [_n(x, 4) for x in w], "expectedReturn": _n(ret), "volatility": _n(vol), "sharpe": _n(ret / vol if vol > 0 else None, 4)}

    min_var = solve(variance)
    max_sharpe = solve(lambda w: -(w @ mu) / math.sqrt(max(variance(w), 1e-18)))

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


def portfolio_analysis(
    bars: Mapping[str, pd.DataFrame],
    holdings: Mapping[str, float],
    cash: float,
    sectors: Mapping[str, str | None],
    market: pd.DataFrame | None,
    seed_text: str,
) -> dict[str, Any]:
    symbols = [s for s, v in holdings.items() if v > 0 and s in bars and len(bars[s]) >= 60]
    left_out = [s for s, v in holdings.items() if v > 0 and s not in symbols]
    invested = float(sum(holdings[s] for s in symbols))
    total = invested + max(cash, 0.0)
    if not symbols or total <= 0:
        raise ValueError("There's nothing invested to analyse yet.")
    w = np.array([holdings[s] / total for s in symbols])
    cash_weight = 1 - w.sum()

    year = _returns(bars, symbols, TRADING_DAYS)
    cov = year.cov().to_numpy() * TRADING_DAYS
    vols = np.sqrt(np.diag(cov))
    variance = float(w @ cov @ w)
    vol = math.sqrt(variance)
    contributions = (w * (cov @ w) / variance) if variance > 0 else np.zeros(len(w))
    daily = year.to_numpy() @ w
    sorted_daily = np.sort(daily)
    tail = max(1, int(len(daily) * 0.05))

    betas: dict[str, float | None] = {}
    portfolio_beta = None
    if market is not None:
        joined = pd.concat([year, market["adj_close"].pct_change().rename("__market")], axis=1, join="inner").dropna()
        m = joined["__market"].to_numpy()
        if len(joined) >= 60 and np.var(m) > 0:
            for s in symbols:
                betas[s] = float(np.cov(joined[s].to_numpy(), m)[0, 1] / np.var(m, ddof=1))
            portfolio_beta = float(np.cov(joined[symbols].to_numpy() @ w, m)[0, 1] / np.var(m, ddof=1))

    # Sector exposure (cash as its own line).
    exposure: dict[str, float] = {}
    for s, weight in zip(symbols, w):
        key = sectors.get(s) or "Other"
        exposure[key] = exposure.get(key, 0.0) + float(weight)
    if cash_weight > 1e-9:
        exposure["Cash"] = float(cash_weight)

    # Stress tests: replay the market's worst falls; then hypothetical shocks.
    stresses: list[dict[str, Any]] = []
    if market is not None:
        for peak, trough, depth in drawdown_episodes(market["adj_close"], STRESS_EPISODES):
            covered = [i for i, s in enumerate(symbols) if bars[s].index.min() <= peak]
            change = 0.0
            for i in covered:
                prices = bars[symbols[i]]["adj_close"]
                change += w[i] * (float(prices.asof(trough)) / float(prices.asof(peak)) - 1)
            stresses.append({
                "name": f"The market's fall from {pd.Timestamp(peak, unit='ms'):%b %Y} to {pd.Timestamp(trough, unit='ms'):%b %Y}",
                "kind": "historical", "start": peak, "end": trough, "market": _n(-depth),
                "portfolio": _n(change), "coverage": _n(float(w[covered].sum() / w.sum()) if len(covered) else 0.0, 4),
            })
    for scenario in HYPOTHETICAL:
        change = sum(w[i] * (scenario["sectors"].get(sectors.get(s) or "", 0.0) + (betas.get(s) if betas.get(s) is not None else 1.0) * scenario["market"]) for i, s in enumerate(symbols))
        stresses.append({"name": scenario["name"], "kind": "hypothetical", "market": scenario["market"], "portfolio": _n(max(change, -1.0))})

    # Monte Carlo: block bootstrap of the portfolio's own daily returns (up to 3 years of them).
    history = _returns(bars, symbols, 3 * TRADING_DAYS).to_numpy() @ w
    rng = np.random.default_rng(int(hashlib.sha256(seed_text.encode()).hexdigest()[:16], 16))
    days = MC_YEARS * TRADING_DAYS
    blocks = math.ceil(days / MC_BLOCK)
    starts = rng.integers(0, max(1, len(history) - MC_BLOCK), size=(MC_PATHS, blocks))
    offsets = np.arange(MC_BLOCK)
    paths = history[np.minimum(starts[:, :, None] + offsets, len(history) - 1)].reshape(MC_PATHS, -1)[:, :days]
    growth = np.cumprod(1 + paths, axis=1)[:, TRADING_DAYS // 12 - 1 :: TRADING_DAYS // 12]  # month ends
    bands = np.percentile(growth, [5, 25, 50, 75, 95], axis=0)
    months = growth.shape[1]
    at = lambda years: growth[:, min(months, years * 12) - 1]
    monte_carlo = {
        "paths": MC_PATHS,
        "years": MC_YEARS,
        "historySessions": int(len(history)),
        "months": list(range(1, months + 1)),
        "bands": {p: [_n(v, 4) for v in row] for p, row in zip(["p5", "p25", "p50", "p75", "p95"], bands)},
        "lossProbability": {f"{y}Y": _n(float(np.mean(at(y) < 1)), 4) for y in (1, 5, 10)},
        "median": {f"{y}Y": _n(float(np.median(at(y))), 4) for y in (1, 5, 10)},
    }

    # Optimisation over the invested stocks (cash left as it is).
    optimisation = None
    if len(symbols) >= 2:
        three = _returns(bars, symbols, 3 * TRADING_DAYS)
        raw_mu = three.mean().to_numpy() * TRADING_DAYS
        mu = 0.5 * raw_mu + 0.5 * raw_mu.mean()
        shrunk = shrunk_covariance(three)
        cap = max(0.4, 1 / len(symbols) + 1e-6)
        result = optimise(mu, shrunk, cap)
        describe = result.pop("describe")
        optimisation = {**result, "current": describe(w / w.sum()), "cap": _n(cap, 4), "estimationSessions": int(len(three))}

    return {
        "asOf": int(year.index[-1]),
        "symbols": symbols,
        "leftOut": left_out,
        "weights": [_n(x, 4) for x in w],
        "cashWeight": _n(cash_weight, 4),
        "risk": {
            "volatility": _n(vol),
            "beta": _n(portfolio_beta, 4),
            "var95": _n(-float(np.quantile(daily, 0.05))),
            "expectedShortfall95": _n(-float(np.mean(sorted_daily[:tail]))),
            "diversificationRatio": _n(float(w @ vols) / vol if vol > 0 else None, 4),
            "holdingVolatility": [_n(v) for v in vols],
            "holdingBeta": [_n(betas.get(s), 4) for s in symbols],
            "riskContribution": [_n(c, 4) for c in contributions],
            "correlation": [[_n(c, 3) for c in row] for row in year.corr().to_numpy()],
        },
        "sectors": {k: _n(v, 4) for k, v in sorted(exposure.items(), key=lambda kv: -kv[1])},
        "stress": stresses,
        "monteCarlo": monte_carlo,
        "optimisation": optimisation,
    }
