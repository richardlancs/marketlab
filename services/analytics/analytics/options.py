"""
Options, for learning: Black-Scholes prices and Greeks, implied volatility,
a simulated option chain, and payoff diagrams for simple strategies.

MarketLab has no real options data. The chain is *simulated*: European
options on each stock, priced by Black-Scholes(-Merton, with a continuous
dividend yield) from the stock's own past-year volatility, at strikes around
today's price and monthly expiries (the third Friday). Real chains differ:
implied volatility varies by strike (the "smile"), American options can be
exercised early, and there are bid-ask spreads.

Conventions: volatility, rates and yields are yearly fractions; time is in
years (calendar days / 365); theta is per calendar day; vega and rho are per
1 percentage point change (0.01).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

import numpy as np
from scipy.optimize import brentq
from scipy.stats import norm

Kind = Literal["call", "put"]

#: The yearly risk-free rate the simulated chain uses: about short-term US Treasury yields in 2026.
RISK_FREE = 0.04
EXPIRIES = 6
MIN_VOL, MAX_VOL = 0.01, 5.0


class OptionError(ValueError):
    pass


def _d1_d2(spot: float, strike: float, years: float, vol: float, rate: float, q: float) -> tuple[float, float]:
    d1 = (math.log(spot / strike) + (rate - q + 0.5 * vol * vol) * years) / (vol * math.sqrt(years))
    return d1, d1 - vol * math.sqrt(years)


def black_scholes(kind: Kind, spot: float, strike: float, years: float, vol: float, rate: float = RISK_FREE, q: float = 0.0) -> dict[str, float]:
    """A European option's price and Greeks."""
    if spot <= 0 or strike <= 0:
        raise OptionError("The stock price and strike must be positive.")
    if years <= 0:
        # At expiry: worth its intrinsic value; delta is all or nothing, the rest are zero.
        intrinsic = max(spot - strike, 0.0) if kind == "call" else max(strike - spot, 0.0)
        delta = (1.0 if spot > strike else 0.0) if kind == "call" else (-1.0 if spot < strike else 0.0)
        return {"price": intrinsic, "delta": delta, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
    if vol <= 0:
        raise OptionError("The volatility must be positive.")
    d1, d2 = _d1_d2(spot, strike, years, vol, rate, q)
    disc_q, disc_r = math.exp(-q * years), math.exp(-rate * years)
    pdf = norm.pdf(d1)
    gamma = disc_q * pdf / (spot * vol * math.sqrt(years))
    vega = spot * disc_q * pdf * math.sqrt(years) / 100
    if kind == "call":
        price = spot * disc_q * norm.cdf(d1) - strike * disc_r * norm.cdf(d2)
        delta = disc_q * norm.cdf(d1)
        theta = -spot * disc_q * pdf * vol / (2 * math.sqrt(years)) - rate * strike * disc_r * norm.cdf(d2) + q * spot * disc_q * norm.cdf(d1)
        rho = strike * years * disc_r * norm.cdf(d2) / 100
    else:
        price = strike * disc_r * norm.cdf(-d2) - spot * disc_q * norm.cdf(-d1)
        delta = -disc_q * norm.cdf(-d1)
        theta = -spot * disc_q * pdf * vol / (2 * math.sqrt(years)) + rate * strike * disc_r * norm.cdf(-d2) - q * spot * disc_q * norm.cdf(-d1)
        rho = -strike * years * disc_r * norm.cdf(-d2) / 100
    return {"price": float(price), "delta": float(delta), "gamma": float(gamma), "theta": float(theta / 365), "vega": float(vega), "rho": float(rho)}


def implied_volatility(kind: Kind, price: float, spot: float, strike: float, years: float, rate: float = RISK_FREE, q: float = 0.0) -> float:
    """The volatility that makes Black-Scholes give `price`. Raises OptionError for a price no volatility can give."""
    if years <= 0:
        raise OptionError("An option at expiry has no time value, so no implied volatility.")
    low = black_scholes(kind, spot, strike, years, MIN_VOL, rate, q)["price"]
    high = black_scholes(kind, spot, strike, years, MAX_VOL, rate, q)["price"]
    if not low <= price <= high:
        bound = "below its value with almost no volatility" if price < low else "above what any sensible volatility gives"
        raise OptionError(f"That price is {bound} ({low:.2f} to {high:.2f}), so there's no implied volatility.")
    return float(brentq(lambda v: black_scholes(kind, spot, strike, years, v, rate, q)["price"] - price, MIN_VOL, MAX_VOL, xtol=1e-10))


# --- The simulated chain -----------------------------------------------------------


def third_fridays(after: date, count: int) -> list[date]:
    """The next `count` monthly expiries (third Fridays) after `after`, skipping one less than a week away."""
    out: list[date] = []
    year, month = after.year, after.month
    while len(out) < count:
        first = date(year, month, 1)
        friday = first + timedelta(days=(4 - first.weekday()) % 7 + 14)
        if friday > after + timedelta(days=6):
            out.append(friday)
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return out


def strike_step(spot: float) -> float:
    """Strike spacing like listed options: finer for cheap stocks."""
    for limit, step in ((25, 1.0), (100, 2.5), (250, 5.0), (1000, 10.0)):
        if spot < limit:
            return step
    return 25.0


def volatility_of(closes: Sequence[float]) -> float:
    """The past year's volatility from daily closes (at most the last 253)."""
    prices = np.asarray(closes[-253:], dtype=float)
    if len(prices) < 30:
        raise OptionError("There isn't enough price history to estimate this stock's volatility.")
    returns = np.diff(np.log(prices))
    return float(np.std(returns, ddof=1) * math.sqrt(252))


def chain(spot: float, vol: float, as_of_ms: int, q: float = 0.0, rate: float = RISK_FREE, expiries: int = EXPIRIES, strikes_each_side: int = 8) -> dict[str, Any]:
    """The simulated chain: for each expiry, calls and puts at strikes around the price, priced at one volatility."""
    today = datetime.fromtimestamp(as_of_ms / 1000, tz=timezone.utc).date()
    step = strike_step(spot)
    centre = round(spot / step) * step
    strikes = [round(centre + i * step, 2) for i in range(-strikes_each_side, strikes_each_side + 1) if centre + i * step > 0]
    out = []
    for expiry in third_fridays(today, expiries):
        days = (expiry - today).days
        years = days / 365
        rows = []
        for k in strikes:
            call = black_scholes("call", spot, k, years, vol, rate, q)
            put = black_scholes("put", spot, k, years, vol, rate, q)
            rows.append({"strike": k, "call": _rounded(call), "put": _rounded(put)})
        out.append({"expiry": expiry.isoformat(), "days": days, "strikes": rows})
    return {"spot": round(spot, 4), "volatility": round(vol, 6), "rate": rate, "dividendYield": round(q, 6), "asOf": as_of_ms, "expiries": out}


def _rounded(values: dict[str, float]) -> dict[str, float]:
    return {k: round(v, 4 if k == "price" else 6) for k, v in values.items()}


# --- Strategies ----------------------------------------------------------------------


def payoff(legs: Sequence[dict[str, Any]], spot: float, points: int = 121) -> dict[str, Any]:
    """
    Profit at expiry across stock prices for a set of legs: options
    {kind: call|put, side: long|short, strike, premium, quantity} and stock
    {kind: stock, side, price, quantity}, quantities in shares (one listed
    contract is 100). Also the breakevens, and the most it can make or lose
    (None when unlimited).
    """
    if not legs:
        raise OptionError("Add at least one leg.")
    low, high = spot * 0.5, spot * 1.5
    strikes = [leg["strike"] for leg in legs if leg["kind"] != "stock"]
    prices = np.unique(np.concatenate([np.linspace(low, high, points), np.array([k for k in strikes if low < k < high])]))

    def profit_at(s: np.ndarray) -> np.ndarray:
        total = np.zeros_like(s)
        for leg in legs:
            sign = 1 if leg["side"] == "long" else -1
            q = leg["quantity"]
            if leg["kind"] == "stock":
                total += sign * q * (s - leg["price"])
            else:
                value = np.maximum(s - leg["strike"], 0) if leg["kind"] == "call" else np.maximum(leg["strike"] - s, 0)
                total += sign * q * (value - leg["premium"])
        return total

    profit = profit_at(prices)
    # Slopes beyond the chart decide whether gains or losses are unlimited: far above (calls, stock) and at zero.
    slope_up = float(profit_at(np.array([high * 10]))[0] - profit_at(np.array([high * 10 - 1]))[0])
    at_zero = float(profit_at(np.array([0.0]))[0])
    candidates = np.concatenate([profit, [at_zero]])
    max_profit = None if slope_up > 1e-9 else float(np.max(candidates))
    max_loss = None if slope_up < -1e-9 else float(np.min(candidates))
    breakevens = []
    for i in range(1, len(prices)):
        a, b = profit[i - 1], profit[i]
        if a == 0:
            breakevens.append(float(prices[i - 1]))
        elif a * b < 0:
            breakevens.append(float(prices[i - 1] + (prices[i] - prices[i - 1]) * (-a) / (b - a)))
    # The options' premiums only: buying shares is an investment, not a premium.
    net = sum((1 if leg["side"] == "short" else -1) * leg["quantity"] * leg["premium"] for leg in legs if leg["kind"] != "stock")
    return {
        "prices": [round(float(p), 4) for p in prices],
        "profit": [round(float(p), 4) for p in profit],
        "breakevens": sorted({round(b, 2) for b in breakevens}),
        "maxProfit": None if max_profit is None else round(max_profit, 2),
        "maxLoss": None if max_loss is None else round(max_loss, 2),
        "netPremium": round(float(net), 2),
    }
