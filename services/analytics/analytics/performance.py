"""
A simulated portfolio's value on each past day, rebuilt from its trades, and
its performance next to a market index (the portfolio page's Performance
tab; also the nightly snapshots, jobs.py).

An account only stores where it is *now* (cash, holdings) and its trades and
events (dividends, splits), newest first, so the history is worked out
backward: start from today and undo each trade, newest first, as the days go
back. That needs no record of how the account started, and it's exact back
to the oldest trade kept. Before the first trade it shows the starting
holdings, carried back in time.

There are no deposits or withdrawals in the simulator, so the value only
changes with prices: the plain start-to-end return is already the fair
("time-weighted") one.

Shorts are negative share counts, so they need nothing special. Options
(Phase 19) are rebuilt the same way from their trades, a contract being 100
shares: at the latest close they're valued at their stored marks, and on
earlier days at what they'd settle for at that close (no time value), so
past values are a little low while options are held. The nightly snapshots
(snapshots.py) record the marked values, and take precedence where they
exist.

Arithmetic follows the Next.js trading code exactly (lib/trading.ts): cents
are rounded the way JavaScript's Math.round does (halves up), not Python's
round() (halves to even), so every value matches what the site shows.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .metrics import Metrics, compute_metrics


def round_cents(value: float) -> float:
    """Math.round(value * 100) / 100, as in lib/trading.ts."""
    return math.floor(value * 100 + 0.5) / 100


Contract = tuple[str, str, float, int]
"""(symbol, kind, strike, expiry)."""


@dataclass(frozen=True)
class DayState:
    cash: float
    shares: dict[str, float]
    options: dict[Contract, float] | None = None


def contract_of(symbol: str, option: Mapping[str, Any]) -> Contract:
    return (symbol, option["kind"], float(option["strike"]), int(option["expiry"]))


def settle_value(contract: Contract, close: float) -> float:
    """What one share of an option is worth at expiry for this close."""
    _, kind, strike, _ = contract
    return max(0.0, close - strike) if kind == "call" else max(0.0, strike - close)


def relevant_symbols(account: Mapping[str, Any]) -> list[str]:
    """Every stock the account holds now or has traded, in first-seen order: what the history needs prices for."""
    seen: dict[str, None] = {}
    for h in account.get("holdings", []):
        seen.setdefault(h["symbol"], None)
    for o in account.get("options", []) or []:
        seen.setdefault(o["symbol"], None)
    for t in account.get("trades", []):
        seen.setdefault(t["symbol"], None)
    return list(seen)


def first_trade_time(account: Mapping[str, Any]) -> int | None:
    trades = account.get("trades", [])
    return min(t["time"] for t in trades) if trades else None


def holdings_timeline(account: Mapping[str, Any], times: Sequence[int]) -> list[DayState]:
    """
    Cash and shares at each of `times` (ascending daily closes).

    A trade fills at the latest close but is stamped with the moment it was
    made, after that close, so it belongs to the latest point with
    time <= trade time: the state at a close includes the trades filled at
    that close's price. Dividends and splits (stamped with their ex-date's
    close) are undone the same way, so a split doesn't look like a loss.
    """
    steps = [(t["time"], 0, t) for t in account.get("trades", [])] + [(e["time"], 1, e) for e in account.get("events", []) or []]
    # Newest first; for equal times, the order they were recorded in (Array.sort is stable).
    steps.sort(key=lambda s: s[0], reverse=True)
    cash = float(account["cash"])
    shares: dict[str, float] = {h["symbol"]: float(h["shares"]) for h in account.get("holdings", [])}
    held_options: dict[Contract, float] = {contract_of(o["symbol"], o): float(o["contracts"]) for o in account.get("options", []) or []}
    states: list[DayState] = [DayState(0.0, {})] * len(times)
    nxt = 0
    for i in range(len(times) - 1, -1, -1):
        after = times[i + 1] if i + 1 < len(times) else math.inf
        while nxt < len(steps) and steps[nxt][0] >= after:
            _, kind, item = steps[nxt]
            nxt += 1
            if kind == 1:
                # Before a dividend or split: without its cash, and (for a split) with the old share count.
                cash -= item["cash"]
                if item["kind"] == "split":
                    shares[item["symbol"]] = item["shares"]
                continue
            if item.get("option"):
                # Undoing an option trade: its premium (100 shares a contract), and the contracts.
                key = contract_of(item["symbol"], item["option"])
                total = round_cents(item["shares"] * 100 * item["price"])
                sign = 1 if item["side"] == "buy" else -1
                cash += sign * total
                held_options[key] = held_options.get(key, 0.0) - sign * item["shares"]
                continue
            total = round_cents(item["shares"] * item["price"])
            held = shares.get(item["symbol"], 0.0)
            if item["side"] == "buy":
                cash += total
                shares[item["symbol"]] = held - item["shares"]
            else:
                cash -= total
                shares[item["symbol"]] = held + item["shares"]
        states[i] = DayState(round_cents(cash), dict(shares), {k: v for k, v in held_options.items() if v} or None)
    return states


class MissingPrices(ValueError):
    pass


def value_series(account: Mapping[str, Any], history: Mapping[str, Sequence[tuple[int, float]]], times: Sequence[int]) -> list[float]:
    """
    The portfolio's total value at each of `times`. `history` has each
    relevant symbol's daily closes *as traded* (not adjusted: the share counts
    are real ones). A day without a price uses the last known one (or,
    before the first, the first). Raises MissingPrices if a symbol held at
    some point has no prices at all.
    """
    states = holdings_timeline(account, times)
    symbols = relevant_symbols(account)
    missing = next((s for s in symbols if not history.get(s)), None)
    if missing:
        raise MissingPrices(f"No prices for {missing}")
    price_at: dict[str, list[float]] = {}
    for symbol in symbols:
        points = history[symbol]
        values: list[float] = []
        j, last = 0, points[0][1]
        for t in times:
            while j < len(points) and points[j][0] <= t:
                last = points[j][1]
                j += 1
            values.append(last)
        price_at[symbol] = values
    marks = {contract_of(o["symbol"], o): float(o["mark"]) for o in account.get("options", []) or [] if o.get("mark") is not None}
    out: list[float] = []
    for i, state in enumerate(states):
        value = state.cash
        for symbol, count in state.shares.items():
            if count:
                value = value + count * price_at[symbol][i]
        for key, contracts in (state.options or {}).items():
            each = marks[key] if i == len(states) - 1 and key in marks else settle_value(key, price_at[key[0]][i])
            value = value + contracts * 100 * each
        out.append(value)
    return out


def _metrics_json(m: Metrics) -> dict[str, Any]:
    return {
        "finalValue": m.final_value,
        "totalReturn": m.total_return,
        "cagr": m.cagr,
        "maxDrawdown": m.max_drawdown,
        "drawdownPeak": m.drawdown_peak,
        "drawdownTrough": m.drawdown_trough,
        "volatility": m.volatility,
        "sharpe": m.sharpe,
        "trades": m.trades,
        "exposure": m.exposure,
    }


def performance(
    account: Mapping[str, Any], history: Mapping[str, Sequence[tuple[int, float]]], index: Sequence[tuple[int, float]], stored: Mapping[int, float] | None = None
) -> dict[str, Any]:
    """
    The Performance tab's numbers over the index's days (the range, already
    chosen by the caller): each day's portfolio and index values, and both
    sides' measures, the same as a backtest's. `stored` are the nightly
    snapshots (snapshots.py): where there's one for a past close, it's used,
    so the record stays exact after old trades drop off the account. The
    latest day is always rebuilt, as trades since the snapshot count.
    """
    times = [t for t, _ in index]
    if len(times) < 2:
        return {"status": "too-short"}
    try:
        values = value_series(account, history, times)
    except MissingPrices:
        return {"status": "missing-prices"}
    if stored:
        values = [stored.get(t, v) if i < len(times) - 1 else v for i, (t, v) in enumerate(zip(times, values))]
    trades_in_range = sum(1 for t in account.get("trades", []) if t["time"] >= times[0])
    return {
        "status": "ok",
        "times": times,
        "portfolio": values,
        "indexValues": [v for _, v in index],
        "metrics": {
            "portfolio": _metrics_json(compute_metrics(list(zip(times, values)), trades_in_range, 1)),
            "index": _metrics_json(compute_metrics(list(index), 0, 1)),
        },
        "firstTrade": first_trade_time(account),
    }
