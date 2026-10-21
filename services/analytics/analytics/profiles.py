"""
A stock's risk and technical profile as of its latest close, from stored
daily bars (analytics/store.py). Stored as analytics_result rows of kind
"stock-profile" and shown on the stock page; the screener ranks stocks by it.

Returns are simple daily returns of adjusted closes, so dividends and
splits are included. Everything uses closes through the latest one; see
technicals.py for how that differs from what a backtest may use.

Risk measures:
- Volatility: the sample standard deviation of daily returns x sqrt(252).
- Beta and correlation with the S&P 500, on the days both have prices.
- Downside deviation: like volatility, but only counting losses (target 0).
- Value at Risk (95%, one day, historical): the loss exceeded on only 5% of
  days in the last year. Expected Shortfall: the average loss on those 5% of
  days. Both are positive numbers (a loss of 2.1% is 0.021).
- Maximum drawdown: the largest fall from a running peak, with its peak,
  trough and the day it was regained (None if it hasn't been yet).

Momentum "12-1" is the return from 12 months ago to 1 month ago, skipping
the latest month (short-term moves tend to reverse), the usual measure.

Dividends are recovered from the prices themselves: on an ex-date, every
earlier adjusted close is scaled by (1 - dividend / previous close), so
dividend = previous close x (1 - that scale). Splits scale by 1/ratio (2-for-1
halves it) and are told apart by size.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from . import technicals as ta

TRADING_DAYS = 252
#: Windows, in sessions, for period returns.
PERIODS = {"1M": 21, "3M": 63, "6M": 126, "1Y": 252, "3Y": 756}
#: Daily return histogram: 0.5% wide bins from -6% to +6%, plus one open-ended bin at each side.
HISTOGRAM_EDGES = np.round(np.arange(-0.06, 0.0601, 0.005), 4)


def _number(value: Any, digits: int = 6) -> float | None:
    """A finite float rounded for storage, or None."""
    if value is None:
        return None
    value = float(value)
    return round(value, digits) if math.isfinite(value) else None


def _last(series: pd.Series) -> float | None:
    clean = series.dropna()
    return _number(clean.iloc[-1]) if len(clean) else None


def _beta_correlation(stock: pd.Series, market: pd.Series) -> tuple[float | None, float | None]:
    joined = pd.concat([stock, market], axis=1, join="inner").dropna()
    if len(joined) < 60:
        return None, None
    a, b = joined.iloc[:, 0].to_numpy(), joined.iloc[:, 1].to_numpy()
    covariance = np.cov(a, b, ddof=1)
    if covariance[1, 1] <= 0 or covariance[0, 0] <= 0:
        return None, None
    return _number(covariance[0, 1] / covariance[1, 1], 4), _number(covariance[0, 1] / math.sqrt(covariance[0, 0] * covariance[1, 1]), 4)


def trailing_dividends(bars: pd.DataFrame, sessions: int = TRADING_DAYS) -> float:
    """Dividends per share paid in the last `sessions` sessions, from the adjusted/traded close ratio."""
    factor = bars["adj_close"] / bars["close"]
    scale = (factor.shift(1) / factor).iloc[-sessions:]
    previous = bars["close"].shift(1).iloc[-sessions:]
    # Between 0.85 and 0.9995: a dividend (up to 15%); a split is far bigger, rounding noise far smaller.
    paid = (scale > 0.85) & (scale < 0.9995)
    return float((previous[paid] * (1 - scale[paid])).sum())


def max_drawdown(prices: pd.Series) -> dict[str, Any]:
    """The largest fall from a running peak: its depth, the peak and trough days, and when (if) it was regained."""
    values = prices.to_numpy()
    times = prices.index.to_numpy()
    peaks = np.maximum.accumulate(values)
    drawdowns = 1 - values / peaks
    trough = int(np.argmax(drawdowns))
    depth = float(drawdowns[trough])
    if depth <= 0:
        return {"depth": 0.0, "peak": None, "trough": None, "recovered": None, "recoveryDays": None}
    peak = int(np.argmax(values[: trough + 1]))
    after = np.nonzero(values[trough:] >= values[peak])[0]
    recovered = int(trough + after[0]) if len(after) else None
    return {
        "depth": _number(depth),
        "peak": int(times[peak]),
        "trough": int(times[trough]),
        "recovered": int(times[recovered]) if recovered is not None else None,
        "recoveryDays": (recovered - trough) if recovered is not None else None,
    }


def stock_profile(bars: pd.DataFrame, market: pd.DataFrame | None) -> dict[str, Any]:
    """The profile of one stock (or index) from its bars; `market` is the S&P 500's bars, for beta."""
    if len(bars) < 30:
        raise ValueError("At least 30 sessions of prices are needed.")
    close = bars["adj_close"]
    # The day's range on the adjusted scale, so a split doesn't look like a crash.
    scale = bars["adj_close"] / bars["close"]
    high, low = bars["high"] * scale, bars["low"] * scale
    returns = close.pct_change().iloc[1:]
    year = returns.iloc[-TRADING_DAYS:]
    market_returns = market["adj_close"].pct_change().iloc[1:] if market is not None and len(market) > 1 else None

    periods = {name: (_number(close.iloc[-1] / close.iloc[-1 - n] - 1) if len(close) > n else None) for name, n in PERIODS.items()}
    periods["12-1"] = _number(close.iloc[-22] / close.iloc[-253] - 1) if len(close) > 252 else None
    dividends = trailing_dividends(bars)
    years3 = min(len(returns), 3 * TRADING_DAYS)
    beta1, corr1 = _beta_correlation(year, market_returns.iloc[-TRADING_DAYS:]) if market_returns is not None else (None, None)
    beta3, corr3 = _beta_correlation(returns.iloc[-years3:], market_returns.iloc[-years3:]) if market_returns is not None else (None, None)

    sorted_losses = np.sort(year.to_numpy())
    tail = max(1, int(math.floor(len(sorted_losses) * 0.05)))
    var95 = -float(np.quantile(year, 0.05))
    es95 = -float(np.mean(sorted_losses[:tail]))
    rolling = returns.rolling(63, min_periods=63).std(ddof=1) * math.sqrt(TRADING_DAYS)
    weekly_rolling = rolling.dropna().iloc[::-5].iloc[::-1].iloc[-104:]  # every 5th session, the last two years

    counts, _ = np.histogram(np.clip(year.to_numpy(), -0.0625, 0.0625), bins=np.concatenate([[-np.inf], HISTOGRAM_EDGES, [np.inf]]))

    sma50, sma200 = ta.sma(close, 50), ta.sma(close, 200)
    above = (sma50 > sma200).where(sma200.notna())
    crosses = above.dropna().astype(int).diff().fillna(0)
    last_cross = crosses[crosses != 0]
    macd = ta.macd(close)
    bands = ta.bollinger(close)
    rsi14 = _last(ta.rsi(close))
    window = close.iloc[-TRADING_DAYS:]
    volume = bars["volume"].dropna()
    price = float(close.iloc[-1])

    return {
        "asOf": int(bars.index[-1]),
        "sessions": len(bars),
        "price": _number(price, 4),
        "returns": periods,
        "income": {"dividendsTTM": _number(dividends, 4), "dividendYield": _number(dividends / float(bars["close"].iloc[-1]))},
        "risk": {
            "volatility1Y": _number(year.std(ddof=1) * math.sqrt(TRADING_DAYS)),
            "volatility3Y": _number(returns.iloc[-years3:].std(ddof=1) * math.sqrt(TRADING_DAYS)),
            "downsideDeviation1Y": _number(math.sqrt(float(np.mean(np.minimum(year, 0) ** 2))) * math.sqrt(TRADING_DAYS)),
            "beta1Y": beta1,
            "beta3Y": beta3,
            "correlation1Y": corr1,
            "correlation3Y": corr3,
            "var95": _number(var95),
            "expectedShortfall95": _number(es95),
            "parametricVar95": _number(1.6449 * year.std(ddof=1) - year.mean()),
            "skew": _number(year.skew(), 4),
            "excessKurtosis": _number(year.kurt(), 4),
            "bestDay": _number(year.max()),
            "worstDay": _number(year.min()),
            "maxDrawdown": max_drawdown(close),
            "drawdownFromHigh": _number(1 - price / float(window.max())),
            "rollingVolatility": [[int(t), _number(v, 4)] for t, v in weekly_rolling.items()],
            "histogram": {"edges": [float(e) for e in HISTOGRAM_EDGES], "counts": [int(c) for c in counts]},
        },
        "technicals": {
            "sma50": _last(sma50),
            "sma200": _last(sma200),
            "ema20": _last(ta.ema(close, 20)),
            "rsi14": _number(rsi14, 2),
            "macd": _last(macd["macd"]),
            "macdSignal": _last(macd["signal"]),
            "macdHistogram": _last(macd["histogram"]),
            "bollingerUpper": _last(bands["upper"]),
            "bollingerLower": _last(bands["lower"]),
            "percentB": _last(bands["percentB"]),
            "atr14": _last(ta.atr(high, low, close)),
            "high52w": _number(window.max(), 4),
            "low52w": _number(window.min(), 4),
            "averageVolume20": _number(volume.iloc[-20:].mean(), 0) if len(volume) >= 20 else None,
            "relativeVolume": _number(volume.iloc[-1] / volume.iloc[-20:].mean(), 3) if len(volume) >= 20 and volume.iloc[-20:].mean() > 0 else None,
            "states": {
                "trend": None if sma200.isna().iloc[-1] else ("above" if price > sma200.iloc[-1] else "below"),
                "cross": None if pd.isna(above.iloc[-1]) else ("golden" if above.iloc[-1] else "death"),
                "lastCross": int(last_cross.index[-1]) if len(last_cross) else None,
                "rsi": None if rsi14 is None else ("overbought" if rsi14 > 70 else "oversold" if rsi14 < 30 else "neutral"),
                "macd": None if macd["histogram"].isna().iloc[-1] else ("bullish" if macd["histogram"].iloc[-1] > 0 else "bearish"),
            },
        },
    }
