"""
Technical indicators for describing a stock *as of a close*: each value at
day D uses closes through D (inclusive), the standard definitions charting
sites use. That's right for "where does this stock stand now?" (the stock
page, the screener, alerts checked after the close).

It is *not* what a backtest may use to decide on day D: that's
indicators.sma_through_previous, which ends at D-1. Strategies never import
this module.

Conventions:
- Wilder's smoothing (RSI, ATR) is an exponential average with alpha = 1/n,
  started from the simple average of the first n values.
- Exponential averages (EMA, MACD) use alpha = 2/(n+1), started from the
  first value.
- Nothing is reported until there are enough observations: a value is NaN
  (and None in results) until its window is full.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma(close: pd.Series, n: int) -> pd.Series:
    return close.rolling(n, min_periods=n).mean()


def ema(close: pd.Series, n: int) -> pd.Series:
    out = close.ewm(span=n, adjust=False).mean()
    out.iloc[: n - 1] = np.nan
    return out


def wilder(values: pd.Series, n: int) -> pd.Series:
    """Wilder's smoothing, seeded with the simple average of the first n values."""
    out = pd.Series(np.nan, index=values.index, dtype=np.float64)
    data = values.to_numpy(dtype=np.float64)
    if len(data) < n:
        return out
    level = float(np.mean(data[:n]))
    result = np.full(len(data), np.nan)
    result[n - 1] = level
    for i in range(n, len(data)):
        level = level + (data[i] - level) / n
        result[i] = level
    return pd.Series(result, index=values.index)


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    """Relative Strength Index (0-100): average gain / average loss over n days, Wilder-smoothed."""
    change = close.diff().iloc[1:]
    gains = wilder(change.clip(lower=0), n)
    losses = wilder((-change).clip(lower=0), n)
    with np.errstate(divide="ignore", invalid="ignore"):
        value = 100 - 100 / (1 + gains / losses)
    value = value.where(losses != 0, 100.0).where(gains.notna())
    return value.reindex(close.index)


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    """MACD line (fast EMA - slow EMA), its signal line (EMA of the line) and the histogram (line - signal)."""
    line = close.ewm(span=fast, adjust=False).mean() - close.ewm(span=slow, adjust=False).mean()
    line.iloc[: slow - 1] = np.nan
    sig = line.dropna().ewm(span=signal, adjust=False).mean().reindex(close.index)
    sig.iloc[: slow + signal - 2] = np.nan
    return pd.DataFrame({"macd": line, "signal": sig, "histogram": line - sig})


def bollinger(close: pd.Series, n: int = 20, k: float = 2.0) -> pd.DataFrame:
    """Bands k (population) standard deviations around the n-day average, and %B: where the close sits (0 = lower band, 1 = upper)."""
    middle = sma(close, n)
    width = close.rolling(n, min_periods=n).std(ddof=0) * k
    upper, lower = middle + width, middle - width
    with np.errstate(divide="ignore", invalid="ignore"):
        percent_b = (close - lower) / (upper - lower)
    return pd.DataFrame({"middle": middle, "upper": upper, "lower": lower, "percentB": percent_b})


def atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    """Average True Range: the Wilder-smoothed average of each day's full range, gaps from the previous close included."""
    previous = close.shift(1)
    true_range = pd.concat([high - low, (high - previous).abs(), (low - previous).abs()], axis=1).max(axis=1)
    return wilder(true_range.iloc[1:], n).reindex(close.index)
