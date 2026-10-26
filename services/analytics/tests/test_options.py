"""Options (options.py): Black-Scholes, implied volatility, the simulated chain and payoffs."""

from __future__ import annotations

import math
from datetime import date

import numpy as np
import pytest

from analytics import options


def test_matches_a_textbook_value():
    # Hull, Options, Futures, and Other Derivatives: S=42, K=40, r=10%, σ=20%, T=0.5 → call 4.76, put 0.81.
    call = options.black_scholes("call", 42, 40, 0.5, 0.2, 0.1)
    put = options.black_scholes("put", 42, 40, 0.5, 0.2, 0.1)
    assert call["price"] == pytest.approx(4.7594, abs=1e-4)
    assert put["price"] == pytest.approx(0.8086, abs=1e-4)


@pytest.mark.parametrize("spot,strike,years,vol,rate,q", [(100, 100, 1, 0.25, 0.04, 0.0), (50, 60, 0.25, 0.4, 0.03, 0.02), (300, 250, 2, 0.15, 0.05, 0.01)])
def test_put_call_parity(spot, strike, years, vol, rate, q):
    call = options.black_scholes("call", spot, strike, years, vol, rate, q)["price"]
    put = options.black_scholes("put", spot, strike, years, vol, rate, q)["price"]
    assert call - put == pytest.approx(spot * math.exp(-q * years) - strike * math.exp(-rate * years), abs=1e-9)


def test_greeks_match_small_changes():
    base = options.black_scholes("call", 100, 105, 0.5, 0.3, 0.04)
    h = 0.01
    up = options.black_scholes("call", 100 + h, 105, 0.5, 0.3, 0.04)["price"]
    down = options.black_scholes("call", 100 - h, 105, 0.5, 0.3, 0.04)["price"]
    assert base["delta"] == pytest.approx((up - down) / (2 * h), abs=1e-6)
    assert base["gamma"] == pytest.approx((up - 2 * base["price"] + down) / h**2, rel=1e-3)
    assert base["vega"] == pytest.approx(options.black_scholes("call", 100, 105, 0.5, 0.31, 0.04)["price"] - base["price"], rel=0.02)
    assert base["theta"] == pytest.approx(options.black_scholes("call", 100, 105, 0.5 - 1 / 365, 0.3, 0.04)["price"] - base["price"], rel=0.02)
    assert 0 < base["delta"] < 1 and base["gamma"] > 0 and base["theta"] < 0


def test_at_expiry_an_option_is_worth_what_it_pays():
    assert options.black_scholes("call", 110, 100, 0, 0.3)["price"] == 10
    assert options.black_scholes("put", 110, 100, 0, 0.3) == {"price": 0, "delta": 0, "gamma": 0, "theta": 0, "vega": 0, "rho": 0}


def test_implied_volatility_recovers_the_volatility():
    for kind in ("call", "put"):
        price = options.black_scholes(kind, 100, 95, 0.4, 0.37, 0.04)["price"]
        assert options.implied_volatility(kind, price, 100, 95, 0.4, 0.04) == pytest.approx(0.37, abs=1e-8)
    with pytest.raises(options.OptionError, match="no implied volatility"):
        options.implied_volatility("call", 0.0001, 100, 50, 0.5)


def test_third_fridays():
    assert options.third_fridays(date(2026, 10, 26), 3) == [date(2026, 11, 20), date(2026, 12, 18), date(2027, 1, 15)]
    # Less than a week before this month's expiry: start with next month's.
    assert options.third_fridays(date(2026, 11, 16), 1) == [date(2026, 12, 18)]


def test_the_chain_is_priced_around_the_stock():
    c = options.chain(187.3, 0.3, 1792699200000)
    assert len(c["expiries"]) == 6
    first = c["expiries"][0]
    strikes = [row["strike"] for row in first["strikes"]]
    assert strikes == sorted(strikes) and strikes[0] < 187.3 < strikes[-1] and strikes[1] - strikes[0] == 5
    calls = [row["call"]["price"] for row in first["strikes"]]
    puts = [row["put"]["price"] for row in first["strikes"]]
    assert calls == sorted(calls, reverse=True) and puts == sorted(puts)
    # Longer expiries are worth more at the money.
    atm = lambda e: min(e["strikes"], key=lambda r: abs(r["strike"] - 187.3))["call"]["price"]
    assert atm(c["expiries"][-1]) > atm(first)


def test_volatility_of_a_steady_walk():
    rng = np.random.default_rng(1)
    closes = 100 * np.exp(np.cumsum(rng.normal(0, 0.02, 400)))
    assert options.volatility_of(closes.tolist()) == pytest.approx(0.02 * math.sqrt(252), rel=0.15)


def leg(kind, side, strike=None, premium=None, price=None, quantity=100):
    return {"kind": kind, "side": side, "strike": strike, "premium": premium, "price": price, "quantity": quantity}


def test_a_long_call_risks_its_premium_for_unlimited_upside():
    p = options.payoff([leg("call", "long", 100, 5)], 100)
    assert p["maxProfit"] is None and p["maxLoss"] == -500
    assert p["breakevens"] == [105.0] and p["netPremium"] == -500


def test_a_covered_call_caps_the_upside():
    p = options.payoff([leg("stock", "long", price=100), leg("call", "short", 110, 3)], 100)
    assert p["maxProfit"] == pytest.approx(1300) and p["maxLoss"] == pytest.approx(-9700)
    assert p["breakevens"] == [97.0] and p["netPremium"] == 300


def test_a_straddle_has_two_breakevens_and_a_bull_spread_is_capped_both_ways():
    straddle = options.payoff([leg("call", "long", 100, 4), leg("put", "long", 100, 3.5)], 100)
    assert straddle["breakevens"] == [92.5, 107.5] and straddle["maxProfit"] is None and straddle["maxLoss"] == -750
    spread = options.payoff([leg("call", "long", 100, 5), leg("call", "short", 110, 2)], 100)
    assert spread["maxProfit"] == 700 and spread["maxLoss"] == -300 and spread["breakevens"] == [103.0]


def test_a_short_call_has_unlimited_risk():
    assert options.payoff([leg("call", "short", 100, 5)], 100)["maxLoss"] is None
