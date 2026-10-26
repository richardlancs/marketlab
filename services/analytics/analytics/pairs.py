"""
Pairs trading, for learning: find two stocks whose prices keep a steady
relationship, then trade the gap between them when it stretches.

1. Scan (formation). Over a formation window (by default the 252 sessions to
   a chosen date), every same-sector pair is tested for cointegration: the
   Engle-Granger test (statsmodels) on log prices. Cointegrated prices may
   wander, but a fixed mix of them (the "gap") keeps returning to its
   average. For each pair:
   - hedge ratio b and intercept a: log A = a + b log B, by least squares;
   - the gap's half-life: how many sessions it takes to close half of a
     stretch, from an AR(1) fit of its daily change on its level;
   - the p-value, and a Benjamini-Hochberg adjusted one. Hundreds of tests
     at 5% find about one false "discovery" in twenty by chance alone; the
     adjustment controls the share of false ones among those kept.

2. Test (trading). The chosen pair is traded over the sessions after the
   formation window, with the formation's a, b, and the gap's average and
   standard deviation only (nothing from the trading period itself):
   - z = (gap - average) / standard deviation, at each close;
   - buy the gap (long A, short B) when z falls to -entry or below, sell it
     (short A, long B) when z reaches +entry; close when z gets back to
     -exit / +exit; stop out when |z| reaches `stop`, and after a stop wait
     until |z| is back inside `entry` before trading again;
   - decisions use the previous close's z and fill at today's close, like
     every MarketLab backtest; the long leg is A's dollars, the short leg b
     times as many of B's, together the starting money;
   - costs: commission per order, slippage on each fill, and a yearly
     borrow fee on the short leg's value, charged daily.

MarketLab's public prices are simulated: stocks share market and sector
moves, nothing more, so genuine cointegration is rare there. The scan
reports how many pairs pass before and after adjustment so that's visible.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import coint

from .metrics import compute_metrics

FORMATION_SESSIONS = 252
MIN_SESSIONS = 200
SHOWN = 20
SIGNIFICANCE = 0.05


class PairError(ValueError):
    pass


def _n(value: Any, digits: int = 6) -> float | None:
    if value is None:
        return None
    value = float(value)
    return round(value, digits) if math.isfinite(value) else None


def hedge(log_a: np.ndarray, log_b: np.ndarray) -> tuple[float, float]:
    """Intercept and slope of log A on log B (least squares)."""
    b, a = np.polyfit(log_b, log_a, 1)
    return float(a), float(b)


def half_life(gap: np.ndarray) -> float | None:
    """Sessions for the gap to close half of a stretch, from Δgap = λ gap(previous) + c; None if it doesn't pull back (λ >= 0)."""
    lagged = gap[:-1] - gap[:-1].mean()
    change = np.diff(gap)
    denominator = float(lagged @ lagged)
    if denominator <= 0:
        return None
    pull = float(lagged @ (change - change.mean())) / denominator
    return -math.log(2) / pull if pull < 0 else None


def benjamini_hochberg(p: Sequence[float]) -> list[float]:
    """Adjusted p-values (step-up, monotone): keep those below q to control the false discovery rate at q."""
    n = len(p)
    if n == 0:
        return []
    order = np.argsort(p)
    ranked = np.asarray(p, dtype=float)[order] * n / np.arange(1, n + 1)
    adjusted = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty(n)
    out[order] = np.minimum(adjusted, 1.0)
    return [float(x) for x in out]


def _window(closes: Mapping[str, pd.Series], end: int, sessions: int) -> pd.DataFrame:
    """Each stock's closes over the last `sessions` sessions to `end` (ms, inclusive); stocks missing days there are dropped."""
    table = pd.concat({s: c[c.index <= end] for s, c in closes.items()}, axis=1).sort_index()
    table = table.iloc[-sessions:]
    return table.loc[:, table.notna().sum() >= MIN_SESSIONS]


def scan(closes: Mapping[str, pd.Series], sectors: Mapping[str, str], formation_end: int, sessions: int = FORMATION_SESSIONS) -> dict[str, Any]:
    """Tests every same-sector pair for cointegration over the formation window."""
    table = _window(closes, formation_end, sessions)
    if table.empty:
        raise PairError("There aren't enough prices before that date to look for pairs.")
    groups: dict[str, list[str]] = {}
    for symbol in table.columns:
        groups.setdefault(sectors.get(symbol) or "Other", []).append(symbol)
    tests: list[dict[str, Any]] = []
    for sector, symbols in sorted(groups.items()):
        symbols.sort()
        for i, a in enumerate(symbols):
            for b in symbols[i + 1 :]:
                both = table[[a, b]].dropna()
                if len(both) < MIN_SESSIONS:
                    continue
                la, lb = np.log(both[a].to_numpy()), np.log(both[b].to_numpy())
                _, p_value, _ = coint(la, lb)
                intercept, slope = hedge(la, lb)
                returns = both.pct_change().dropna()
                tests.append({
                    "a": a, "b": b, "sector": sector, "pValue": float(p_value), "hedgeRatio": slope, "intercept": intercept,
                    "halfLife": half_life(la - slope * lb), "correlation": float(returns[a].corr(returns[b])), "sessions": int(len(both)),
                })
    adjusted = benjamini_hochberg([t["pValue"] for t in tests])
    for t, q in zip(tests, adjusted):
        t["adjusted"] = q
    tests.sort(key=lambda t: (t["pValue"], t["a"], t["b"]))
    return {
        "formationStart": int(table.index[0]),
        "formationEnd": int(table.index[-1]),
        "tests": len(tests),
        "passed": sum(t["pValue"] < SIGNIFICANCE for t in tests),
        "passedAdjusted": sum(t["adjusted"] < SIGNIFICANCE for t in tests),
        "expectedByChance": _n(SIGNIFICANCE * len(tests), 2),
        "pairs": [
            {**t, "pValue": _n(t["pValue"]), "adjusted": _n(t["adjusted"]), "hedgeRatio": _n(t["hedgeRatio"], 4), "intercept": _n(t["intercept"], 4), "halfLife": _n(t["halfLife"], 1), "correlation": _n(t["correlation"], 3)}
            for t in tests[:SHOWN]
        ],
    }


def backtest(
    a_closes: pd.Series,
    b_closes: pd.Series,
    formation_end: int,
    names: tuple[str, str] = ("A", "B"),
    *,
    formation_sessions: int = FORMATION_SESSIONS,
    trading_sessions: int = FORMATION_SESSIONS,
    entry: float = 2.0,
    exit: float = 0.0,
    stop: float = 4.0,
    initial_cash: float = 10_000.0,
    commission: float = 0.0,
    slippage_bps: float = 5.0,
    borrow_bps: float = 50.0,
) -> dict[str, Any]:
    if not 0 <= exit < entry < stop:
        raise PairError("The exit level must be below the entry level, and the entry below the stop.")
    both = pd.concat({"a": a_closes, "b": b_closes}, axis=1, join="inner").sort_index()
    formation = both[both.index <= formation_end].iloc[-formation_sessions:]
    trading = both[both.index > formation_end].iloc[:trading_sessions]
    if len(formation) < MIN_SESSIONS:
        raise PairError("There aren't enough prices before that date for this pair.")
    if len(trading) < 20:
        raise PairError("There aren't enough prices after the formation window to test the pair: choose an earlier date.")

    la, lb = np.log(formation["a"].to_numpy()), np.log(formation["b"].to_numpy())
    intercept, slope = hedge(la, lb)
    gap = la - intercept - slope * lb
    mean, sd = float(gap.mean()), float(gap.std(ddof=1))
    if sd <= 0:
        raise PairError("The gap between these two never moved, so there's nothing to trade.")
    _, formation_p, _ = coint(la, lb)

    pa, pb = trading["a"].to_numpy(), trading["b"].to_numpy()
    z = (np.log(pa) - intercept - slope * np.log(pb) - mean) / sd
    slip = slippage_bps / 10_000
    borrow_daily = borrow_bps / 10_000 / 252
    cash, shares_a, shares_b = initial_cash, 0.0, 0.0
    position, waiting = 0, False  # +1 long the gap (long A, short B), -1 short it; waiting after a stop
    equity: list[tuple[int, float]] = []
    trades: list[dict[str, Any]] = []
    costs = {"commission": 0.0, "slippage": 0.0, "borrow": 0.0}
    invested = 0
    times = [int(t) for t in trading.index]

    def fill(time: int, symbol: str, shares: float, close: float, reason: str) -> None:
        nonlocal cash
        price = close * (1 + slip) if shares > 0 else close * (1 - slip)
        cash -= shares * price + commission
        costs["commission"] += commission
        costs["slippage"] += abs(shares) * close * slip
        trades.append({"time": time, "symbol": symbol, "side": "buy" if shares > 0 else "sell", "shares": abs(shares), "price": price, "reason": reason})

    for day, time in enumerate(times):
        if day > 0:
            previous = z[day - 1]
            want = position
            reason = ""
            if position != 0 and abs(previous) >= stop:
                want, waiting, reason = 0, True, "stop"
            elif position == 1 and previous >= -exit:
                want, reason = 0, "gap closed"
            elif position == -1 and previous <= exit:
                want, reason = 0, "gap closed"
            elif position == 0:
                if waiting and abs(previous) < entry:
                    waiting = False
                if not waiting and abs(previous) < stop:
                    if previous <= -entry:
                        want, reason = 1, "gap stretched low"
                    elif previous >= entry:
                        want, reason = -1, "gap stretched high"
            if want != position:
                if shares_a:
                    fill(time, names[0], -shares_a, pa[day], reason)
                if shares_b:
                    fill(time, names[1], -shares_b, pb[day], reason)
                shares_a = shares_b = 0.0
                if want != 0:
                    value = cash + 0.0
                    leg_a = value / (1 + abs(slope))
                    leg_b = abs(slope) * leg_a
                    fill(time, names[0], want * leg_a / pa[day], pa[day], reason)
                    fill(time, names[1], -want * math.copysign(1, slope) * leg_b / pb[day], pb[day], reason)
                    shares_a = want * leg_a / pa[day]
                    shares_b = -want * math.copysign(1, slope) * leg_b / pb[day]
                position = want
        short_value = (-shares_a * pa[day] if shares_a < 0 else 0.0) + (-shares_b * pb[day] if shares_b < 0 else 0.0)
        if short_value > 0:
            fee = short_value * borrow_daily
            cash -= fee
            costs["borrow"] += fee
        if position != 0:
            invested += 1
        equity.append((time, cash + shares_a * pa[day] + shares_b * pb[day]))

    metrics = compute_metrics(equity, len(trades), invested / len(equity))
    trading_p = coint(np.log(pa), np.log(pb))[1] if len(pa) >= 30 else None
    return {
        "formation": {
            "start": int(formation.index[0]), "end": int(formation.index[-1]), "sessions": int(len(formation)),
            "hedgeRatio": _n(slope, 4), "intercept": _n(intercept, 4), "mean": _n(mean), "sd": _n(sd), "halfLife": _n(half_life(gap), 1), "pValue": _n(formation_p),
        },
        "trading": {"pValue": _n(trading_p)},
        "settings": {"entry": entry, "exit": exit, "stop": stop, "initialCash": initial_cash, "commission": commission, "slippageBps": slippage_bps, "borrowBps": borrow_bps},
        "times": times,
        "z": [_n(v, 4) for v in z],
        "prices": {"a": [_n(v, 4) for v in pa], "b": [_n(v, 4) for v in pb]},
        "equity": [{"time": t, "price": round(v, 2)} for t, v in equity],
        "trades": [{**t, "shares": _n(t["shares"]), "price": _n(t["price"], 4)} for t in trades],
        "metrics": metrics,
        "costs": {k: round(v, 2) for k, v in costs.items()},
    }
