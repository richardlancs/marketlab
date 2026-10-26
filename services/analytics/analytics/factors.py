"""
Factor analysis: what drives a stock's or a portfolio's returns.

Five factors, each a daily return series built from MarketLab's own
universe of stocks, the same way on the simulated market and on real
prices:

- Market: the S&P 500's daily return.
- Size: small companies minus big ones (by market value).
- Value: cheap companies minus expensive ones (by earnings yield, earnings
  over market value).
- Momentum: the past year's winners minus its losers, skipping the latest
  month (12-1 momentum), re-sorted at the start of every month using only
  the prices known then.
- Low volatility: the calmest stocks minus the jumpiest (by the past year's
  volatility), re-sorted monthly the same way.

Each long-short factor holds the top and bottom 30% of the stocks it can
rank, equally weighted. Size and value sort on today's market values and
earnings (the only ones stored), so their groups don't change over time:
fine for describing exposures, not for testing a strategy.

A stock's (or portfolio's) exposures come from regressing its daily returns
over the past year on the five factors (ordinary least squares, with
heteroskedasticity-robust standard errors): the betas say how strongly it
moves with each factor, the t-statistics how sure that is, R² how much of
its movement they explain, and alpha (annualised) what's left over.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
import pandas as pd
import statsmodels.api as sm

from . import store
from .db import Database

FACTORS = ("market", "size", "value", "momentum", "lowVol")
FACTOR_NAMES = {"market": "Market", "size": "Size", "value": "Value", "momentum": "Momentum", "lowVol": "Low volatility"}
#: The share of rankable stocks in each side of a long-short factor.
TAIL = 0.3
#: Sessions in the regression window, and the fewest it accepts.
WINDOW = 252
MIN_SESSIONS = 120
#: Momentum: a year of returns, skipping the latest month.
MOMENTUM_LOOKBACK = 252
MOMENTUM_SKIP = 21
VOL_LOOKBACK = 252
#: How far back factor returns are built (calendar days of prices loaded).
HISTORY_DAYS = 6 * 366
DAY_MS = 86_400_000


class FactorError(ValueError):
    pass


def _sides(values: pd.Series) -> tuple[list[str], list[str]]:
    """The bottom and top TAIL of the ranked (non-missing) values: (low, high)."""
    ranked = values.dropna().sort_values(kind="mergesort")
    n = int(math.floor(len(ranked) * TAIL))
    if n < 2:
        return [], []
    return list(ranked.index[:n]), list(ranked.index[-n:])


def _long_short(returns: pd.DataFrame, long: Sequence[str], short: Sequence[str]) -> pd.Series:
    """The equal-weighted long group's daily return minus the short group's."""
    return returns[list(long)].mean(axis=1, skipna=True) - returns[list(short)].mean(axis=1, skipna=True)


def _monthly_long_short(returns: pd.DataFrame, closes: pd.DataFrame, score) -> pd.Series:
    """
    A long-short factor re-sorted at the first session of each month: the
    groups are chosen from `score(closes up to the session before)`, then
    held until the next month starts. Sessions before the first sort are NaN.
    """
    out = pd.Series(np.nan, index=returns.index)
    months = pd.to_datetime(returns.index, unit="ms").to_period("M")
    starts = [i for i in range(1, len(returns)) if months[i] != months[i - 1]]
    for k, i in enumerate(starts):
        end = starts[k + 1] if k + 1 < len(starts) else len(returns)
        scores = score(closes.iloc[:i])
        if scores is None:
            continue
        low, high = _sides(scores)
        if not low:
            continue
        out.iloc[i:end] = _long_short(returns.iloc[i:end], high, low).to_numpy()
    return out


def _momentum(history: pd.DataFrame) -> pd.Series | None:
    if len(history) <= MOMENTUM_LOOKBACK:
        return None
    then = history.iloc[-MOMENTUM_LOOKBACK - 1]
    recent = history.iloc[-MOMENTUM_SKIP - 1]
    return recent / then - 1


def _low_vol(history: pd.DataFrame) -> pd.Series | None:
    if len(history) <= VOL_LOOKBACK:
        return None
    vol = history.iloc[-VOL_LOOKBACK - 1 :].pct_change(fill_method=None).iloc[1:].std()
    # Low volatility is the long side: rank on minus the volatility.
    return -vol


def characteristics(db: Database, source: str, universe: Sequence[str], last_close: Mapping[str, float]) -> tuple[dict[str, float], dict[str, float]]:
    """
    Each stock's market value and earnings yield: from the price store's own
    numbers (the simulated market has them), otherwise from the SEC company
    numbers (diluted shares × the last close; trailing net income over that).
    """
    marks = ",".join("?" for _ in universe)
    rows = db.query(f"SELECT symbol, market_cap, pe_ratio FROM price_series WHERE source = ? AND symbol IN ({marks})", [source, *universe]) if universe else []
    caps: dict[str, float] = {}
    yields: dict[str, float] = {}
    for r in rows:
        if r["market_cap"] and r["market_cap"] > 0:
            caps[r["symbol"]] = float(r["market_cap"])
        if r["pe_ratio"] and r["pe_ratio"] > 0:
            yields[r["symbol"]] = 1 / float(r["pe_ratio"])
    missing = [s for s in universe if s not in caps or s not in yields]
    if missing:
        marks = ",".join("?" for _ in missing)
        for r in db.query(f"SELECT symbol, data FROM company_facts WHERE symbol IN ({marks}) AND data IS NOT NULL", missing):
            facts = json.loads(r["data"])
            symbol = r["symbol"]
            shares = (facts.get("years") or [{}])[-1].get("dilutedShares")
            price = last_close.get(symbol)
            if symbol not in caps and shares and price:
                caps[symbol] = shares * price
            income = (facts.get("trailing") or {}).get("netIncome")
            if symbol not in yields and income is not None and caps.get(symbol):
                yields[symbol] = income / caps[symbol]
    return caps, yields


def build_factor_returns(closes: Mapping[str, pd.Series], market: pd.Series, caps: Mapping[str, float], yields: Mapping[str, float]) -> pd.DataFrame:
    """
    The five factors' daily returns, on the market's sessions, from the first
    session where all five are defined. `closes` are adjusted closes.
    """
    if len(market) < MOMENTUM_LOOKBACK + MIN_SESSIONS:
        raise FactorError("There isn't enough price history to build the factors yet.")
    table = pd.DataFrame({s: c for s, c in closes.items()}).reindex(market.index)
    # A missing day carries the last close (no trade that day), but nothing before a stock's first close.
    table = table.ffill()
    returns = table.pct_change(fill_method=None)
    universe = list(table.columns)
    small, big = _sides(pd.Series({s: caps.get(s, np.nan) for s in universe}, dtype=float))
    dear, cheap = _sides(pd.Series({s: yields.get(s, np.nan) for s in universe}, dtype=float))
    if not small or not cheap:
        raise FactorError("Too few stocks have market values and earnings to build the size and value factors.")
    factors = pd.DataFrame(
        {
            "market": market.pct_change(fill_method=None),
            "size": _long_short(returns, small, big),
            "value": _long_short(returns, cheap, dear),
            "momentum": _monthly_long_short(returns, table, _momentum),
            "lowVol": _monthly_long_short(returns, table, _low_vol),
        }
    )
    factors = factors.dropna()
    if len(factors) < MIN_SESSIONS:
        raise FactorError("There isn't enough price history to build the factors yet.")
    return factors


def exposures(returns: pd.Series, factors: pd.DataFrame) -> dict[str, Any]:
    """
    A return series' factor exposures over the latest WINDOW sessions both
    have. Raises FactorError with fewer than MIN_SESSIONS in common.
    """
    joined = pd.concat([returns.rename("y"), factors], axis=1, join="inner").dropna().iloc[-WINDOW:]
    if len(joined) < MIN_SESSIONS:
        raise FactorError(f"Factor exposures need at least {MIN_SESSIONS} sessions of returns; there are {len(joined)}.")
    x = sm.add_constant(joined[list(FACTORS)], has_constant="add")
    fit = sm.OLS(joined["y"], x).fit(cov_type="HC1")

    def num(v: float) -> float | None:
        return float(v) if math.isfinite(float(v)) else None

    residual_vol = float(np.std(fit.resid, ddof=len(FACTORS) + 1) * math.sqrt(252))
    return {
        "betas": {f: num(fit.params[f]) for f in FACTORS},
        "tStats": {f: num(fit.tvalues[f]) for f in FACTORS},
        "alpha": num(fit.params["const"] * 252),
        "alphaT": num(fit.tvalues["const"]),
        "r2": num(fit.rsquared),
        "residualVolatility": num(residual_vol),
        "sessions": int(len(joined)),
        "start": int(joined.index[0]),
        "asOf": int(joined.index[-1]),
    }


# --- Stored results ---------------------------------------------------------------


def _factor_json(factors: pd.DataFrame, groups: dict[str, Any]) -> dict[str, Any]:
    return {
        "times": [int(t) for t in factors.index],
        **{f: [round(float(v), 10) for v in factors[f]] for f in FACTORS},
        "groups": groups,
        "asOf": int(factors.index[-1]),
    }


def load_factor_returns(db: Database, source: str) -> pd.DataFrame | None:
    """The stored factor returns (from the nightly job), or None if there aren't any yet."""
    rows = db.query("SELECT result FROM analytics_result WHERE kind = 'factor-returns' AND subject = 'all' AND source = ?", [source])
    if not rows:
        return None
    data = json.loads(rows[0]["result"])
    return pd.DataFrame({f: data[f] for f in FACTORS}, index=pd.Index(data["times"], dtype=np.int64))


def refresh(db: Database, source: str, universe: Sequence[str]) -> dict[str, Any]:
    """
    Rebuilds the factor returns and every stock's exposures when any stored
    price has changed (otherwise does nothing), and stores them.
    """
    index = store.series_index(db, source, [*universe, store.MARKET])
    if store.MARKET not in index:
        raise FactorError("The price store doesn't have the market index yet.")
    names = [s for s in universe if s in index]
    checksum = store.input_checksum({s: index[s] for s in [*names, store.MARKET]})
    stored = store.stored_versions(db, "factor-returns", source).get("all")
    if stored == (store.ANALYTICS_VERSION, checksum):
        return {"status": "unchanged", "stocks": 0}
    last = index[store.MARKET].last_time
    since = last - HISTORY_DAYS * DAY_MS
    closes = store.load_closes(db, source, [*names, store.MARKET], since, last)
    market = closes.pop(store.MARKET, None)
    if market is None:
        raise FactorError("The price store doesn't have the market index yet.")
    caps, yields = characteristics(db, source, list(closes), {s: float(c.iloc[-1]) for s, c in closes.items()})
    factors = build_factor_returns(closes, market, caps, yields)
    small, big = _sides(pd.Series({s: caps.get(s, np.nan) for s in closes}, dtype=float))
    dear, cheap = _sides(pd.Series({s: yields.get(s, np.nan) for s in closes}, dtype=float))
    groups = {"size": {"long": small, "short": big}, "value": {"long": cheap, "short": dear}}
    rows: list[tuple[str, str, int, Any]] = [("all", checksum, int(factors.index[-1]), _factor_json(factors, groups))]
    for symbol, series in closes.items():
        try:
            result = exposures(series.pct_change(fill_method=None), factors)
        except FactorError:
            continue
        rows.append((symbol, index[symbol].checksum, result["asOf"], result))
    # Stock exposures first, then the factor returns: a run that stops halfway is redone in full next time.
    store.save_results(db, "stock-factors", source, rows[1:])
    store.save_results(db, "factor-returns", source, rows[:1])
    return {"status": "computed", "stocks": len(rows) - 1, "asOf": int(factors.index[-1])}


def portfolio_exposures(db: Database, source: str, holdings: Sequence[tuple[str, float]]) -> dict[str, Any]:
    """
    A portfolio's exposures, holding today's weights (by value; cash left
    out) over the past year, like the risk analysis does.
    """
    factors = load_factor_returns(db, source)
    if factors is None:
        raise FactorError("The factors are calculated each night and aren't ready yet. Try again later.")
    total = sum(v for _, v in holdings if v > 0)
    if total <= 0:
        raise FactorError("There's nothing invested to analyse.")
    weights = {s: v / total for s, v in holdings if v > 0}
    since = int(factors.index[0])
    closes = store.load_closes(db, source, list(weights), since, int(factors.index[-1]))
    missing = [s for s in weights if s not in closes]
    if missing:
        raise FactorError(f"There are no stored prices for {', '.join(missing)} yet.")
    table = pd.DataFrame(closes).reindex(factors.index).ffill()
    returns = table.pct_change(fill_method=None)
    # Before a stock's prices start, its share counts as cash (no return) rather than dropping the day.
    portfolio = sum(returns[s].fillna(0.0) * w for s, w in weights.items())
    result = exposures(portfolio, factors)
    result["holdings"] = {s: round(w, 6) for s, w in weights.items()}
    return result
