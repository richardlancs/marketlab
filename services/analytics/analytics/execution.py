"""
Order execution and transaction costs: turning a decided target into fills at
the session's close. The same rules as the TypeScript engine (lib/backtest/engine.ts):

- Orders fill at the session's close, moved by slippage against the trader:
  buys at close x (1 + slippage), sells at close x (1 - slippage).
- Each order pays a fixed commission.
- A buy spends at most the cash left after its commission; a sell sells at
  most the shares held. A trade worth less than MIN_TRADE_VALUE (at the
  close) is skipped, so rounding never creates commission-only orders.
- A sell to a 0% target sells every share held, leaving no fractional sliver.
- To reach a target, every sell is filled before any buy, so the sale
  proceeds are there to buy with. Order sizes come from the portfolio's
  total value at this session's close.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Mapping

from .accounting import Portfolio

MIN_TRADE_VALUE = 1.0


@dataclass(frozen=True)
class Costs:
    commission: float = 0.0
    """Dollars per order."""
    slippage_bps: float = 0.0
    """Basis points (0.01%) the fill is worse than the close."""


@dataclass(frozen=True)
class Trade:
    time: int
    symbol: str
    side: Literal["buy", "sell"]
    shares: float
    price: float
    """The fill price per share, after slippage."""
    commission: float


def buy(portfolio: Portfolio, time: int, symbol: str, value: float, close: float, costs: Costs) -> Trade | None:
    """Buys about `value` dollars' worth at the close plus slippage, within the cash available."""
    price = close * (1 + costs.slippage_bps / 10_000)
    spend = min(value, portfolio.cash - costs.commission)  # can't spend money we don't have
    if spend < MIN_TRADE_VALUE:
        return None
    qty = spend / price
    portfolio.cash -= spend + costs.commission
    portfolio.shares[symbol] += qty
    return Trade(time, symbol, "buy", qty, price, costs.commission)


def sell(portfolio: Portfolio, time: int, symbol: str, value: float, close: float, costs: Costs, *, exit: bool = False) -> Trade | None:
    """
    Sells `value` dollars' worth (at the close) at the close minus slippage, within the shares held.
    With `exit`, sells every share: value / close can come out a hair under the shares held, which
    would leave a sliver that still counts as a position.
    """
    price = close * (1 - costs.slippage_bps / 10_000)
    qty = portfolio.shares[symbol] if exit else min(value / close, portfolio.shares[symbol])  # can't sell more than we hold
    if qty * close < MIN_TRADE_VALUE:
        return None
    portfolio.cash += qty * price - costs.commission
    portfolio.shares[symbol] -= qty
    return Trade(time, symbol, "sell", qty, price, costs.commission)


def execute_target(portfolio: Portfolio, target: Mapping[str, float], closes: Mapping[str, float], time: int, costs: Costs) -> list[Trade]:
    """Moves the portfolio to `target` (fractions of total value) at these closes; returns the trades made."""
    total = portfolio.cash + portfolio.holdings_value(closes)
    deltas = [(s, target.get(s, 0.0) * total - portfolio.shares[s] * closes[s]) for s in portfolio.shares]
    trades: list[Trade] = []
    for s, delta in deltas:  # sells first, so the cash is there for the buys
        if delta < 0 and (t := sell(portfolio, time, s, -delta, closes[s], costs, exit=not target.get(s, 0.0) > 0)):
            trades.append(t)
    for s, delta in deltas:
        if delta > 0 and (t := buy(portfolio, time, s, delta, closes[s], costs)):
            trades.append(t)
    return trades
