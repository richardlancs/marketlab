"""
A review of a simulated account's own trading (the portfolio page's Review
tab): which trades worked, the habits behind them, and whether trading
helped at all.

Round trips. Sales are matched to purchases first in, first out (FIFO): a
sale uses up the oldest shares still held, so one sale can close parts of
several purchases, and each part is a round trip with its own entry, exit,
return and days held. Shares held at the start of the oldest trade kept
(a starting portfolio, or trades older than the account keeps) are lots
"from the start", with no entry date; their cost is recovered from the
average cost the account recorded (lib/trading.ts stores each sale's gain
against the average cost, and each holding's average cost). The account
itself reports gains against the average cost, so its totals can differ a
little from FIFO's. Splits multiply a lot's shares and divide its price.
Dividends aren't part of a round trip's gain.

After you sold. For each sale, the stock's return over the next 5, 21 and
63 sessions (adjusted closes, so dividends and splits count), and the S&P
500's over the same days.

The disposition effect (Odean, 1998). On each day with a sale, every stock
held that morning is a gain or a loss against its cost (the FIFO cost of the
shares held, at that day's close as traded). One that was sold (any of it)
counts as realised; one kept counts as a paper gain or loss. Across those
days, PGR = realised gains / (realised gains + paper gains), and PLR the same
for losses. PGR above PLR means gains were taken more readily than losses.
Reported from MIN_SELL_DAYS selling days on.

Compared with doing nothing. From the close a week after the first trade,
the account's actual value (performance.value_series), the same holdings and
cash frozen there (each holding growing with its adjusted close, so
dividends count, as they do for the account), and the S&P 500 scaled to the
same start.

By reason. Each round trip carries the reason given when its shares were
bought (trade notes), and the closed ones are grouped by it.

Prices are passed in two ways: `history`, each stock's closes as traded
(trade prices and costs are in those), and `adjusted`, adjusted closes from
the price store, for returns over time.
"""

from __future__ import annotations

import math
from bisect import bisect_right
from collections import deque
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from . import performance

MIN_SELL_DAYS = 10
AFTER = (5, 21, 63)
SHOWN = 200
POINTS = 300
FIRST_WEEK_MS = 7 * 86_400_000


def _n(value: Any, digits: int = 6) -> float | None:
    if value is None:
        return None
    value = float(value)
    return round(value, digits) if math.isfinite(value) else None


@dataclass
class Lot:
    shares: float
    price: float
    time: int | None  # None: held from the start
    reason: str | None = None  # why it was bought, if the trade said


def chronological(account: Mapping[str, Any]) -> list[tuple[int, str, Mapping[str, Any]]]:
    """Trades and events oldest first. Both arrive newest first; for equal times the recorded order is kept, reversed."""
    steps = [(t["time"], "trade", t) for t in account.get("trades", [])] + [(e["time"], "event", e) for e in account.get("events", []) or []]
    steps.sort(key=lambda s: s[0], reverse=True)  # stable, as performance.holdings_timeline does
    return steps[::-1]


def starting_state(account: Mapping[str, Any]) -> tuple[float, dict[str, float]]:
    """Cash and shares before the oldest trade or event kept."""
    steps = chronological(account)
    if not steps:
        return float(account["cash"]), {h["symbol"]: float(h["shares"]) for h in account.get("holdings", [])}
    first = steps[0][0]
    state = performance.holdings_timeline(account, [first - 1, first])[0]
    return state.cash, {s: n for s, n in state.shares.items() if n > 1e-9}


def starting_costs(account: Mapping[str, Any], start: Mapping[str, float]) -> dict[str, float | None]:
    """
    Each starting holding's cost per share. The total cost of a holding
    only changes with buys (splits keep it), so at the first sale after the
    start, average cost x shares then = start shares x start cost + the buys'
    cost since. The first sale's average cost comes from its recorded gain:
    price - gain / shares. Without a sale, the holding's average cost now.
    """
    holdings = {h["symbol"]: h for h in account.get("holdings", [])}
    steps = chronological(account)
    out: dict[str, float | None] = {}
    for symbol, n0 in start.items():
        shares, bought = n0, 0.0
        cost_then: float | None = None
        for _, kind, item in steps:
            if item["symbol"] != symbol:
                continue
            if kind == "event":
                if item["kind"] == "split" and item.get("sharesAfter") is not None:
                    shares = float(item["sharesAfter"])
                continue
            if item["side"] == "buy":
                shares += item["shares"]
                bought += item["shares"] * item["price"]
            else:
                if item.get("realizedGain") is not None:
                    cost_then = (item["price"] - item["realizedGain"] / item["shares"]) * shares
                break
        if cost_then is None and symbol in holdings and holdings[symbol].get("averageCost") is not None:
            cost_then = float(holdings[symbol]["averageCost"]) * float(holdings[symbol]["shares"])
        out[symbol] = (cost_then - bought) / n0 if cost_then is not None and cost_then - bought > 0 else None
    return out


def session_of(times: Sequence[int], moment: int) -> int:
    """The index of the latest session at or before `moment` (0 if it's before them all): the close a trade filled at."""
    return max(0, bisect_right(times, moment) - 1)


def _price_on(points: Sequence[tuple[int, float]] | None, moment: int) -> float | None:
    """The latest close as traded at or before `moment`."""
    if not points:
        return None
    i = bisect_right([t for t, _ in points], moment) - 1
    return points[i][1] if i >= 0 else points[0][1]


def round_trips(account: Mapping[str, Any], history: Mapping[str, Sequence[tuple[int, float]]], now: int) -> dict[str, Any]:
    """FIFO round trips, open lots, and the disposition counts, walking the account forward from its start."""
    _, start = starting_state(account)
    costs = starting_costs(account, start)
    lots: dict[str, deque[Lot]] = {}
    for symbol, n in start.items():
        price = costs.get(symbol) or _price_on(history.get(symbol), 0)
        if price is not None:
            lots[symbol] = deque([Lot(n, price, None)])
    closed: list[dict[str, Any]] = []
    sales: list[dict[str, Any]] = []
    counts = {"realisedGains": 0, "realisedLosses": 0, "paperGains": 0, "paperLosses": 0}
    sell_days: set[int] = set()

    steps = chronological(account)
    # Group a day's sales, so the disposition counts see the morning's holdings.
    i = 0
    while i < len(steps):
        moment, kind, item = steps[i]
        if kind == "event":
            if item["kind"] == "split" and item.get("sharesAfter") and item.get("shares"):
                ratio = float(item["sharesAfter"]) / float(item["shares"])
                for lot in lots.get(item["symbol"], ()):
                    lot.shares *= ratio
                    lot.price /= ratio
            i += 1
            continue
        if item["side"] == "buy":
            lots.setdefault(item["symbol"], deque()).append(Lot(float(item["shares"]), float(item["price"]), moment, item.get("reason")))
            i += 1
            continue
        # A run of sales on the same calendar day (UTC): one disposition day.
        day = moment // 86_400_000
        j = i
        while j < len(steps) and steps[j][1] == "trade" and steps[j][2]["side"] == "sell" and steps[j][0] // 86_400_000 == day:
            j += 1
        sold_today = {steps[k][2]["symbol"] for k in range(i, j)}
        for symbol, held in lots.items():
            shares = sum(l.shares for l in held)
            if shares <= 1e-9 or symbol in sold_today:
                continue
            price = _price_on(history.get(symbol), moment)
            if price is None:
                continue
            cost = sum(l.shares * l.price for l in held) / shares
            if price > cost:
                counts["paperGains"] += 1
            elif price < cost:
                counts["paperLosses"] += 1
        outcome: dict[str, float] = {}
        for k in range(i, j):
            sale = steps[k][2]
            remaining = float(sale["shares"])
            held = lots.get(sale["symbol"], deque())
            cost_total, used = 0.0, 0.0
            while remaining > 1e-9 and held:
                lot = held[0]
                take = min(lot.shares, remaining)
                closed.append({
                    "symbol": sale["symbol"], "entry": lot.time, "exit": steps[k][0], "shares": _n(take, 4),
                    "entryPrice": _n(lot.price, 4), "exitPrice": _n(sale["price"], 4),
                    "gain": _n((sale["price"] - lot.price) * take, 2), "return": _n(sale["price"] / lot.price - 1),
                    "reason": lot.reason, "exitReason": sale.get("reason"),
                })
                cost_total += take * lot.price
                used += take
                lot.shares -= take
                remaining -= take
                if lot.shares <= 1e-9:
                    held.popleft()
            if used > 0:
                outcome[sale["symbol"]] = outcome.get(sale["symbol"], 0.0) + (sale["price"] * used - cost_total)
            sales.append({"symbol": sale["symbol"], "time": steps[k][0], "price": float(sale["price"])})
        for gain in outcome.values():
            if gain > 0:
                counts["realisedGains"] += 1
            elif gain < 0:
                counts["realisedLosses"] += 1
        sell_days.add(day)
        i = j

    still_open = []
    for symbol, held in lots.items():
        price = _price_on(history.get(symbol), now)
        for lot in held:
            if lot.shares > 1e-9 and price is not None:
                still_open.append({
                    "symbol": symbol, "entry": lot.time, "shares": _n(lot.shares, 4), "entryPrice": _n(lot.price, 4), "price": _n(price, 4),
                    "gain": _n((price - lot.price) * lot.shares, 2), "return": _n(price / lot.price - 1), "reason": lot.reason,
                })
    return {"closed": closed, "open": still_open, "sales": sales, "disposition": counts, "sellDays": len(sell_days)}


def summarise(closed: Sequence[Mapping[str, Any]], days_held: Sequence[int | None]) -> dict[str, Any]:
    gains = np.array([t["gain"] for t in closed], dtype=float)
    returns = np.array([t["return"] for t in closed], dtype=float)
    wins, losses = gains[gains > 0], gains[gains < 0]
    known_days = [d for d in days_held if d is not None]
    best = int(np.argmax(returns)) if len(returns) else None
    worst = int(np.argmin(returns)) if len(returns) else None
    return {
        "roundTrips": len(closed),
        "wins": int(len(wins)),
        "losses": int(len(losses)),
        "hitRate": _n(len(wins) / len(closed), 4) if len(closed) else None,
        "averageWin": _n(wins.mean(), 2) if len(wins) else None,
        "averageLoss": _n(losses.mean(), 2) if len(losses) else None,
        "averageWinReturn": _n(returns[gains > 0].mean()) if len(wins) else None,
        "averageLossReturn": _n(returns[gains < 0].mean()) if len(losses) else None,
        "profitFactor": _n(wins.sum() / -losses.sum(), 4) if len(losses) and losses.sum() < 0 else None,
        "realised": _n(gains.sum(), 2),
        "medianDays": _n(float(np.median(known_days)), 1) if known_days else None,
        "best": {**closed[best]} if best is not None else None,
        "worst": {**closed[worst]} if worst is not None else None,
    }


def by_reason(closed: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Closed round trips grouped by why the shares were bought ("none" when the trade didn't say), most trips first."""
    groups: dict[str, list[Mapping[str, Any]]] = {}
    for t in closed:
        groups.setdefault(t.get("reason") or "none", []).append(t)
    out = []
    for reason, trips in groups.items():
        returns = np.array([t["return"] for t in trips], dtype=float)
        out.append({
            "reason": reason, "roundTrips": len(trips), "hitRate": _n(float(np.mean(returns > 0)), 4),
            "averageReturn": _n(returns.mean()), "gain": _n(sum(t["gain"] for t in trips), 2),
        })
    return sorted(out, key=lambda g: (-g["roundTrips"], g["reason"]))


def _forward(series: pd.Series | None, moment: int, sessions: int) -> float | None:
    """The return from the close at or before `moment` to `sessions` sessions later, or None if that's in the future."""
    if series is None or series.empty:
        return None
    i = int(series.index.searchsorted(moment, side="right")) - 1
    if i < 0 or i + sessions >= len(series):
        return None
    return float(series.iloc[i + sessions] / series.iloc[i] - 1)


def after_sales(sales: Sequence[Mapping[str, Any]], adjusted: Mapping[str, pd.Series], market: pd.Series | None) -> dict[str, Any]:
    rows = []
    for sale in sales:
        series = adjusted.get(sale["symbol"])
        row: dict[str, Any] = {"symbol": sale["symbol"], "time": sale["time"], "price": _n(sale["price"], 4)}
        for k in AFTER:
            row[f"after{k}"] = _n(_forward(series, sale["time"], k))
            row[f"market{k}"] = _n(_forward(market, sale["time"], k))
        rows.append(row)
    summary = {}
    for k in AFTER:
        values = np.array([r[f"after{k}"] for r in rows if r[f"after{k}"] is not None], dtype=float)
        relative = np.array([r[f"after{k}"] - r[f"market{k}"] for r in rows if r[f"after{k}"] is not None and r[f"market{k}"] is not None], dtype=float)
        summary[str(k)] = {
            "sales": int(len(values)),
            "average": _n(values.mean()) if len(values) else None,
            "rose": _n(float(np.mean(values > 0)), 4) if len(values) else None,
            "averageVsMarket": _n(relative.mean()) if len(relative) else None,
        }
    return {"sales": rows[::-1][:SHOWN], "summary": summary}


def disposition(counts: Mapping[str, int], sell_days: int) -> dict[str, Any]:
    rg, rl, pg, pl = counts["realisedGains"], counts["realisedLosses"], counts["paperGains"], counts["paperLosses"]
    pgr = rg / (rg + pg) if rg + pg else None
    plr = rl / (rl + pl) if rl + pl else None
    enough = sell_days >= MIN_SELL_DAYS and pgr is not None and plr is not None
    return {
        **counts, "sellDays": sell_days, "minimumDays": MIN_SELL_DAYS, "enough": enough,
        "pgr": _n(pgr, 4), "plr": _n(plr, 4), "difference": _n(pgr - plr, 4) if enough else None,
    }


def _thin(values: Sequence[Any], points: int = POINTS) -> list[int]:
    """Indices of at most `points` evenly spread values, always keeping the first and last."""
    n = len(values)
    if n <= points:
        return list(range(n))
    return sorted({round(i * (n - 1) / (points - 1)) for i in range(points)})


def compared(
    account: Mapping[str, Any], history: Mapping[str, Sequence[tuple[int, float]]], adjusted: Mapping[str, pd.Series], index: Sequence[tuple[int, float]]
) -> dict[str, Any] | None:
    """The account against its first week's holdings kept unchanged, and against the index, from a week after the first trade."""
    first = performance.first_trade_time(account)
    if first is None:
        return None
    times = [t for t, _ in index]
    anchor = session_of(times, first + FIRST_WEEK_MS)
    days = times[anchor:]
    if len(days) < 2:
        return None
    try:
        actual = performance.value_series(account, history, days)
    except performance.MissingPrices:
        return None
    state = performance.holdings_timeline(account, days)[0]
    frozen = np.full(len(days), state.cash, dtype=float)
    for symbol, shares in state.shares.items():
        if shares <= 1e-9:
            continue
        series = adjusted.get(symbol)
        raw = _price_on(history.get(symbol), days[0])
        if series is None or raw is None:
            return None
        growth = series.reindex(days, method="ffill").bfill().to_numpy(dtype=float)
        frozen += shares * raw * growth / growth[0]
    levels = np.array([v for _, v in index[anchor:]], dtype=float)
    start = actual[0]
    benchmark = start * levels / levels[0]
    keep = _thin(days)
    return {
        "start": days[0],
        "times": [days[i] for i in keep],
        "actual": [_n(actual[i], 2) for i in keep],
        "kept": [_n(frozen[i], 2) for i in keep],
        "benchmark": [_n(benchmark[i], 2) for i in keep],
        "returns": {
            "actual": _n(actual[-1] / start - 1) if start else None,
            "kept": _n(frozen[-1] / frozen[0] - 1) if frozen[0] else None,
            "benchmark": _n(levels[-1] / levels[0] - 1),
        },
    }


def review(
    account: Mapping[str, Any],
    history: Mapping[str, Sequence[tuple[int, float]]],
    adjusted: Mapping[str, pd.Series],
    index: Sequence[tuple[int, float]],
    market: pd.Series | None,
) -> dict[str, Any]:
    if not account.get("trades"):
        return {"status": "no-trades"}
    times = [t for t, _ in index]
    now = times[-1] if times else max(t["time"] for t in account["trades"])
    trips = round_trips(account, history, now)
    sessions = lambda a, b: session_of(times, b) - session_of(times, a)  # noqa: E731
    closed = trips["closed"]
    for t in closed:
        t["days"] = sessions(t["entry"], t["exit"]) if t["entry"] is not None else None
    for t in trips["open"]:
        t["days"] = sessions(t["entry"], now) if t["entry"] is not None else None
    return {
        "status": "ok",
        "asOf": now,
        "method": "fifo",
        "summary": {**summarise(closed, [t["days"] for t in closed]), "averageCostRealised": _n(sum(t.get("realizedGain") or 0 for t in account["trades"] if t["side"] == "sell"), 2)},
        "roundTrips": sorted(closed, key=lambda t: -t["exit"])[:SHOWN],
        "open": sorted(trips["open"], key=lambda t: (t["symbol"], t["entry"] or 0)),
        "byReason": by_reason(closed),
        "afterSales": after_sales(trips["sales"], adjusted, market),
        "disposition": disposition(trips["disposition"], trips["sellDays"]),
        "compared": compared(account, history, adjusted, index),
    }
