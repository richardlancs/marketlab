"""
How much a stock is likely to move: a GARCH(1,1) volatility forecast, the
"volatility cone", and a check of how well the forecast held up.

GARCH(1,1) says calm and stormy spells each tend to last: tomorrow's variance
is a long-run level, plus a share (alpha) of today's squared surprise, plus a
share (beta) of today's variance:

    variance(t+1) = omega + alpha * return(t)^2 + beta * variance(t)

alpha + beta is the persistence: how slowly a shock fades. The long-run
variance is omega / (1 - alpha - beta), and a shock's half-life is
log(0.5) / log(alpha + beta) sessions.

- The fit is by Gaussian maximum likelihood (SciPy) on daily log returns,
  de-meaned, over the last 3 years (at least FIT_MIN sessions).
- Forecasts over h sessions add up each day's expected variance, which drifts
  from tomorrow's towards the long-run level by a factor of alpha + beta a day.
- The cone is realised volatility over 5 to 252 sessions, today's and its
  10th/50th/90th percentiles through the stock's history.
- The check fits on everything except the last CHECK_SESSIONS sessions, then
  forecasts each of those one day ahead with the parameters fixed (nothing
  from the checked days goes into the fit). It counts the days that stayed
  inside the 90% range, and compares the forecast's QLIKE loss with a plain
  "last 21 days" forecast's (lower is better).

MarketLab's simulated market is itself built with GARCH(1,1) (alpha 0.09,
beta 0.89 on its market factor), so on the public site the model is right
about how prices are made, and fitting the S&P 500 should find roughly those.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.signal import lfilter

TRADING_DAYS = 252
FIT_SESSIONS = 3 * TRADING_DAYS
FIT_MIN = 500
CHECK_SESSIONS = 250
HORIZONS = {"day": 1, "week": 5, "month": 21}
CONE_WINDOWS = (5, 21, 63, 126, 252)
#: One standard deviation, and the two-sided 90% range of a normal distribution.
Z90 = 1.6449
MAX_PERSISTENCE = 0.999


def _n(value: Any, digits: int = 6) -> float | None:
    if value is None:
        return None
    value = float(value)
    return round(value, digits) if math.isfinite(value) else None


def variances(returns: np.ndarray, omega: float, alpha: float, beta: float, start: float) -> np.ndarray:
    """Each day's conditional variance; the last entry is the forecast for the day after the last return."""
    # variance(t) = beta * variance(t-1) + (omega + alpha * return(t-1)^2): a first-order linear filter.
    drive = np.empty(len(returns) + 1)
    drive[0] = start
    drive[1:] = omega + alpha * returns**2
    return lfilter([1.0], [1.0, -beta], drive)


def _negative_log_likelihood(params: np.ndarray, returns: np.ndarray, start: float) -> float:
    omega, alpha, beta = params
    if omega <= 0 or alpha < 0 or beta < 0 or alpha + beta >= MAX_PERSISTENCE:
        return 1e10
    v = variances(returns, omega, alpha, beta, start)[:-1]
    if np.any(v <= 0):
        return 1e10
    return 0.5 * float(np.sum(np.log(v) + returns**2 / v))


def fit_garch(returns: np.ndarray) -> dict[str, float] | None:
    """omega, alpha, beta by maximum likelihood on de-meaned returns; None if the fit fails or isn't stationary."""
    r = np.asarray(returns, dtype=float)
    r = r - r.mean()
    sample = float(r.var())
    if len(r) < FIT_MIN or sample <= 0:
        return None
    best = None
    # A few starting points: the likelihood surface is flat along alpha + beta, and one start can stall.
    for alpha, beta in ((0.08, 0.9), (0.05, 0.93), (0.15, 0.8)):
        x0 = np.array([sample * (1 - alpha - beta), alpha, beta])
        result = minimize(
            _negative_log_likelihood, x0, args=(r, sample), method="L-BFGS-B",
            bounds=[(sample * 1e-6, sample * 10), (0.0, 0.5), (0.0, MAX_PERSISTENCE)],
        )
        if best is None or result.fun < best.fun:
            best = result
    omega, alpha, beta = (float(x) for x in best.x)
    if best.fun >= 1e10 or alpha + beta >= MAX_PERSISTENCE or omega <= 0:
        return None
    return {"omega": omega, "alpha": alpha, "beta": beta}


def horizon_variance(next_day: float, long_run: float, persistence: float, sessions: int) -> float:
    """Expected variance of the sum of the next `sessions` daily returns."""
    k = np.arange(sessions)
    return float(np.sum(long_run + persistence**k * (next_day - long_run)))


def cone(returns: pd.Series) -> list[dict[str, Any]]:
    """Realised (annualised) volatility over each window: now, and its 10th/50th/90th percentiles over history."""
    out = []
    for window in CONE_WINDOWS:
        rolling = (returns.rolling(window, min_periods=window).std(ddof=1) * math.sqrt(TRADING_DAYS)).dropna()
        if len(rolling) < 2:
            continue
        values = rolling.to_numpy()
        low, median, high = np.quantile(values, [0.1, 0.5, 0.9])
        now = float(values[-1])
        out.append({
            "sessions": window, "now": _n(now), "low": _n(low), "median": _n(median), "high": _n(high),
            "percentile": _n(float(np.mean(values <= now)), 4),
        })
    return out


def check(returns: np.ndarray) -> dict[str, Any] | None:
    """One-day-ahead forecasts for the last CHECK_SESSIONS sessions, from a fit on the sessions before them."""
    if len(returns) < FIT_MIN + CHECK_SESSIONS:
        return None
    before = returns[:-CHECK_SESSIONS]
    fit = fit_garch(before[-FIT_SESSIONS:])
    if fit is None:
        return None
    mean = before[-FIT_SESSIONS:].mean()
    r = returns - mean
    v = variances(r, fit["omega"], fit["alpha"], fit["beta"], float(r[: len(before)].var()))[:-1]
    checked, forecast = r[-CHECK_SESSIONS:], v[-CHECK_SESSIONS:]
    # The plain forecast: the variance of the 21 sessions before each day.
    naive = np.array([r[i - 21 : i].var(ddof=1) for i in range(len(r) - CHECK_SESSIONS, len(r))])
    squared = checked**2

    def qlike(variance: np.ndarray) -> float:
        return float(np.mean(np.log(variance) + squared / variance))

    return {
        "sessions": CHECK_SESSIONS,
        "inside90": _n(float(np.mean(np.abs(checked) <= Z90 * np.sqrt(forecast))), 4),
        "naiveInside90": _n(float(np.mean(np.abs(checked) <= Z90 * np.sqrt(naive))), 4),
        "qlike": _n(qlike(forecast), 4),
        "naiveQlike": _n(qlike(naive), 4),
    }


def forecast(close: pd.Series) -> dict[str, Any]:
    """The volatility forecast for a series of (adjusted) closes."""
    log_returns = np.log(close.astype(float)).diff().dropna()
    series = log_returns.to_numpy()
    recent = series[-FIT_SESSIONS:]
    price = float(close.iloc[-1])
    realised21 = float(series[-21:].std(ddof=1)) if len(series) >= 22 else None
    base: dict[str, Any] = {
        "asOf": int(close.index[-1]),
        "price": _n(price, 4),
        "realised21": _n(realised21 * math.sqrt(TRADING_DAYS)) if realised21 is not None else None,
        "cone": cone(log_returns),
        "check": check(series),
    }
    fit = fit_garch(recent)
    if fit is None:
        # Not enough history, or no clustering to speak of: fall back to the last 21 sessions' volatility.
        daily = realised21
        return {**base, "model": None, "ranges": _ranges(price, {name: daily**2 * h for name, h in HORIZONS.items()}) if daily else None}

    persistence = fit["alpha"] + fit["beta"]
    long_run = fit["omega"] / (1 - persistence)
    r = recent - recent.mean()
    next_day = float(variances(r, fit["omega"], fit["alpha"], fit["beta"], float(r.var()))[-1])
    return {
        **base,
        "model": {
            "omega": _n(fit["omega"], 10), "alpha": _n(fit["alpha"], 4), "beta": _n(fit["beta"], 4), "persistence": _n(persistence, 4),
            "halfLife": _n(math.log(0.5) / math.log(persistence), 1) if persistence > 0 else None,
            "longRun": _n(math.sqrt(long_run * TRADING_DAYS)), "now": _n(math.sqrt(next_day * TRADING_DAYS)), "sessions": len(recent),
        },
        "ranges": _ranges(price, {name: horizon_variance(next_day, long_run, persistence, h) for name, h in HORIZONS.items()}),
    }


def outlook(log_returns: np.ndarray) -> dict[str, Any] | None:
    """Volatility now, long-run, and over the next month (annualised, and the month's own sd) for one return series; None without a model."""
    recent = np.asarray(log_returns, dtype=float)[-FIT_SESSIONS:]
    fit = fit_garch(recent)
    if fit is None:
        return None
    persistence = fit["alpha"] + fit["beta"]
    long_run = fit["omega"] / (1 - persistence)
    r = recent - recent.mean()
    next_day = float(variances(r, fit["omega"], fit["alpha"], fit["beta"], float(r.var()))[-1])
    return {
        "now": _n(math.sqrt(next_day * TRADING_DAYS)),
        "longRun": _n(math.sqrt(long_run * TRADING_DAYS)),
        "month": _n(math.sqrt(horizon_variance(next_day, long_run, persistence, HORIZONS["month"]))),
        "halfLife": _n(math.log(0.5) / math.log(persistence), 1) if persistence > 0 else None,
    }


def _ranges(price: float, variance: dict[str, float]) -> dict[str, Any]:
    """For each horizon: one standard deviation and the 90% range, as a return and as prices."""
    out = {}
    for name, v in variance.items():
        sd = math.sqrt(v)
        out[name] = {
            "sessions": HORIZONS[name], "sd": _n(sd),
            "low68": _n(price * math.exp(-sd), 4), "high68": _n(price * math.exp(sd), 4),
            "low90": _n(price * math.exp(-Z90 * sd), 4), "high90": _n(price * math.exp(Z90 * sd), 4),
        }
    return out
