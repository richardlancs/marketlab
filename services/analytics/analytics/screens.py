"""
Historical screening: apply a stock screen every month, using only what was
known at the time, and hold what it picked.

The question it answers: "If I had run this screen at the start of every
month, which stocks would I have owned, and how would that have done?"

It differs from the backtests in engine.py, which hold stocks the user chose:
here the candidates are a whole universe (MarketLab's catalog, ~100 stocks),
the screen picks up to five of them each month, and the picks change.

Everything is calculated from a *universe snapshot* (`build_snapshot`): the
market's trading days and every candidate's adjusted close on each of them,
with a gap (None) wherever a stock has no price. The snapshot is saved with a
run, so reproducing it uses exactly the same inputs; a live run is calculated
from a snapshot too, so the two paths are the same code.

The one preset, "Monthly momentum leaders", applies the Screener's Momentum
leaders preset (lib/analytics/screener.ts) as it would have looked on each
date, with the stock profiles' definitions (profiles.py):

- **The calendar** is the market index's trading days. A decision is made on
  the first measured session, then on the first session of every later month.
- **Decide** on session D from closes through D-1, the latest completed
  session (`rank` is only ever given closes before D). Each candidate:
  1. needs a close on D-1 itself ("no price" otherwise: not trading yet, halted
     or gone), and at least 253 closes in all ("not enough history");
  2. 12-1 momentum = close[-22] / close[-253] - 1, counted in the stock's own
     closes, where close[-1] is D-1's: the return from 252 to 21 trading days
     before D-1, which skips the latest month;
  3. the 200-day average = the mean of its last 200 closes, D-1's included;
     it's "above" when D-1's close is strictly greater;
  4. its momentum percentile among every candidate with a momentum that day
     (0 = lowest, 1 = highest, ties share the average rank), exactly as
     screener.ts `percentiles` does over today's rows.
  It qualifies with a percentile of 0.8 or more (the top fifth) *and* above
  its average. Qualifiers are ranked by momentum, highest first; equal
  momentum is broken by symbol, alphabetically (as the Screener sorts).
- **Hold** the top five at 20% of the portfolio each; fewer qualifiers leave
  the rest in cash. Every pick is reset to 20% at each monthly decision.
- **Execute** at D's close with execution.py's rules (commission per order,
  slippage against the trader, sells before buys, no trade under $1).
- **Missing prices** are never filled in, and never traded at:
  - a pick with no close on D isn't bought; its 20% stays in cash until the
    next decision (a pick already held keeps its shares as they are);
  - a stock to sell with no close on D stays held, and is sold at the close of
    the next session that has one;
  - a held stock is *valued* at its latest close on a day it has none.
- **Warm-up:** the snapshot includes up to WARMUP_SESSIONS (plus a margin)
  sessions before the start, when they exist. If no candidate can be ranked
  on the start date, results begin on the first session where one can, and a
  warning says so.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

import pandas as pd

from . import engine
from .accounting import Portfolio
from .execution import Costs, Trade, buy, sell
from .metrics import YEAR_MS, compute_metrics
from .store import MARKET

SCREEN_NAME = "monthly-momentum-leaders"
SCREEN_VERSION = "1.0.0"

#: 12-1 momentum needs 253 closes (close[-253]); the 200-day average fits within them.
MOMENTUM_SESSIONS = 253
SKIP_SESSIONS = 21
AVERAGE_SESSIONS = 200
#: Earlier sessions the snapshot keeps before the start: the warm-up, plus a margin for stocks with gaps.
WARMUP_SESSIONS = MOMENTUM_SESSIONS + SKIP_SESSIONS
TOP_FIFTH = 0.8
MAX_HOLDINGS = 5
WEIGHT = 1 / MAX_HOLDINGS
#: Candidates per run, and sessions per snapshot (as data.MAX_POINTS).
MAX_UNIVERSE = 200

PRESET = {
    "id": "momentum",
    "name": "Monthly momentum leaders",
    "rules": [
        "12-1 momentum in the top fifth (80th percentile or higher) of the stocks that could be ranked that day",
        "Last close strictly above its 200-day average",
        "Up to five, highest momentum first; equal momentum is broken alphabetically",
        "20% in each, the rest in cash; chosen again at the start of every month",
    ],
}

ASSUMPTIONS = {
    "signals": "Each selection uses closes through the previous trading session only; its trades fill at the close of the first trading session of the month.",
    "momentum": "12-1 momentum is the return from the close 252 trading days before the latest close to the close 21 trading days before it, counted in each stock's own trading days. It skips the latest month.",
    "average": "A stock is above its 200-day average when its latest close is strictly greater than the mean of its last 200 closes, the latest included.",
    "ranking": "Momentum percentiles are taken among every candidate with enough history on that day. The top fifth that are also above their average qualify, ranked by momentum, with ties broken alphabetically by symbol.",
    "weights": "Up to five stocks at 20% each; unused slots stay in cash. Holdings are reset to 20% at every monthly selection.",
    "missingPrices": "Prices are never filled in. A pick with no price on the trading day isn't bought, and its slot stays in cash until the next month. A stock to sell with no price is sold on the next day that has one. A held stock is valued at its latest close.",
    "universe": "The candidates are today's MarketLab catalog, not every company that was listed at the time. Companies that were delisted or acquired are missing, so results carry survivorship bias.",
    "prices": engine.ASSUMPTIONS["prices"],
    "costs": engine.ASSUMPTIONS["costs"],
    "shares": engine.ASSUMPTIONS["shares"],
    "fundamentals": "Only prices are used. Company numbers aren't, because when each filing became public isn't recorded.",
}


class ScreenError(engine.InputError):
    """Settings or data a historical screen can't use, with a message fit to show."""


@dataclass(frozen=True)
class Settings:
    start: int
    end: int
    initial_cash: float
    costs: Costs = field(default_factory=Costs)


# ---------------------------------------------------------------------------
# The snapshot: every input, fixed
# ---------------------------------------------------------------------------


def build_snapshot(
    *,
    universe: Sequence[str],
    market: pd.Series,
    closes: Mapping[str, pd.Series],
    settings: Settings,
    source: str,
    as_of: int,
    market_name: str = "S&P 500",
) -> dict[str, Any]:
    """
    The inputs a run needs, as plain JSON: the market's sessions from
    WARMUP_SESSIONS before the start through the end, and each candidate's
    close on each (None where it has none). Closes a stock has on a day the
    market doesn't are left out. A candidate with no prices at all stays in,
    with every close None, so the universe is exactly the one asked for.
    """
    days = market.index[market.index <= settings.end]
    first = int(days.searchsorted(settings.start))
    if first >= len(days):
        raise ScreenError("There are no trading days in that date range.")
    kept = days[max(0, first - WARMUP_SESSIONS) :]
    if len(kept) > engine.MAX_POINTS:
        raise ScreenError(f"Choose a shorter period: at most {engine.MAX_POINTS} trading days, including the year before the start, can be used.")
    series: dict[str, list[float | None]] = {}
    for symbol in sorted(set(universe)):
        s = closes.get(symbol)
        if s is None:
            series[symbol] = [None] * len(kept)
            continue
        aligned = s.reindex(kept)
        series[symbol] = [None if math.isnan(v) else float(v) for v in aligned.tolist()]
    return {
        "version": 1,
        "kind": "historical-screen",
        "source": source,
        "simulated": source == "mock",
        "asOf": int(as_of),
        "adjustment": "split-and-dividend-adjusted-closes",
        "calendar": [int(t) for t in kept],
        "market": {"symbol": MARKET, "name": market_name, "prices": [float(v) for v in market.loc[kept].tolist()]},
        "closes": series,
    }


def checksum_of(snapshot: Mapping[str, Any]) -> str:
    """SHA-256 of the snapshot's canonical JSON (sorted keys, no spaces): the same inputs always give the same value."""
    text = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(text.encode()).hexdigest()


def describe_snapshot(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    """What identifies a snapshot (the same fields as lib/backtest/stored.ts DatasetInfo)."""
    checksum = checksum_of(snapshot)
    calendar = snapshot["calendar"]
    observations = sum(1 for prices in snapshot["closes"].values() for p in prices if p is not None) + len(calendar)
    return {
        "checksum": checksum,
        "datasetVersion": f"{snapshot['source']}:{checksum[:12]}",
        "source": snapshot["source"],
        "simulated": snapshot["simulated"],
        "asOf": snapshot["asOf"],
        "firstDate": calendar[0] if calendar else None,
        "lastDate": calendar[-1] if calendar else None,
        "observations": observations,
    }


def check_snapshot(snapshot: Mapping[str, Any]) -> None:
    """Refuses a snapshot that isn't well formed (one read back from the database included)."""
    calendar = snapshot.get("calendar")
    if not isinstance(calendar, list) or len(calendar) < 2 or any(not isinstance(t, int) for t in calendar) or any(b <= a for a, b in zip(calendar, calendar[1:])):
        raise ScreenError("The snapshot's trading days aren't in order.")
    prices = snapshot["market"]["prices"]
    if len(prices) != len(calendar) or any(not (isinstance(p, (int, float)) and math.isfinite(p) and p > 0) for p in prices):
        raise ScreenError("The snapshot's market prices don't line up with its trading days.")
    for symbol, closes in snapshot["closes"].items():
        if len(closes) != len(calendar) or any(p is not None and not (isinstance(p, (int, float)) and math.isfinite(p) and p > 0) for p in closes):
            raise ScreenError(f"The snapshot's prices for {symbol} don't line up with its trading days.")


# ---------------------------------------------------------------------------
# One month's decision
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Candidate:
    """One stock on one decision date, from closes through the previous session only."""

    symbol: str
    status: str
    """selected | qualified | low-momentum | below-average | short-history | no-price | no-data"""
    momentum: float | None = None
    percentile: float | None = None
    close: float | None = None
    """The latest completed close (the previous session's)."""
    average: float | None = None
    closes: int = 0
    """How many closes the stock had through the previous session, counted up to the 253 needed."""
    rank: int | None = None
    """Its place among qualifying stocks (1 = highest momentum)."""


def percentiles(values: Sequence[float]) -> list[float]:
    """Where each value sits among the others, 0 (lowest) to 1 (highest); ties share the average rank. As screener.ts `percentiles`."""
    if len(values) == 1:
        return [0.5]
    order = sorted(range(len(values)), key=lambda i: values[i])
    out = [0.0] * len(values)
    start = 0
    while start < len(order):
        end = start
        while end + 1 < len(order) and values[order[end + 1]] == values[order[start]]:
            end += 1
        rank = (start + end) / 2 / (len(values) - 1)
        for k in range(start, end + 1):
            out[order[k]] = rank
        start = end + 1
    return out


def _measure(symbol: str, history: Sequence[float | None]) -> Candidate:
    """A stock's momentum and average from its closes before the decision session (`history[-1]` is the latest completed one)."""
    if not history or history[-1] is None:
        status = "no-data" if all(p is None for p in history) else "no-price"
        return Candidate(symbol, status)
    recent: list[float] = []  # newest first: just the closes the measures need
    for p in reversed(history):
        if p is not None:
            recent.append(p)
            if len(recent) == MOMENTUM_SESSIONS:
                break
    close = recent[0]
    count = len(recent)
    if count < MOMENTUM_SESSIONS:
        return Candidate(symbol, "short-history", close=close, closes=count)
    total = 0.0
    for p in reversed(recent[:AVERAGE_SESSIONS]):  # oldest first, left to right
        total = total + p
    average = total / AVERAGE_SESSIONS
    momentum = recent[SKIP_SESSIONS] / recent[MOMENTUM_SESSIONS - 1] - 1
    return Candidate(symbol, "", momentum=momentum, close=close, average=average, closes=count)


def rank(history: Mapping[str, Sequence[float | None]]) -> list[Candidate]:
    """
    The screen on one date, from each candidate's closes *before* the
    decision session (callers pass closes[:D]; session D is never given).
    Returns every candidate, qualifying ones first in rank order, then the
    rest alphabetically.
    """
    measured = [_measure(s, history[s]) for s in sorted(history)]
    ranked = [c for c in measured if c.momentum is not None]
    shares = percentiles([c.momentum for c in ranked]) if ranked else []
    scored: list[Candidate] = []
    for c, p in zip(ranked, shares):
        status = "low-momentum" if p < TOP_FIFTH else "below-average" if not c.close > c.average else "qualified"
        scored.append(Candidate(c.symbol, status, c.momentum, p, c.close, c.average, c.closes))
    qualifying = sorted((c for c in scored if c.status == "qualified"), key=lambda c: (-c.momentum, c.symbol))
    out = [
        Candidate(c.symbol, "selected" if i < MAX_HOLDINGS else "qualified", c.momentum, c.percentile, c.close, c.average, c.closes, i + 1)
        for i, c in enumerate(qualifying)
    ]
    chosen = {c.symbol for c in out}
    out += [c for c in scored if c.symbol not in chosen]
    out += [c for c in measured if c.momentum is None]
    return out


# ---------------------------------------------------------------------------
# Explanations, written from the numbers
# ---------------------------------------------------------------------------


def _day(ms: int) -> str:
    d = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return f"{d:%b} {d.day}, {d.year}"


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _signed(x: float) -> str:
    return f"{x * 100:+.1f}%"


def _percentile(p: float) -> str:
    return f"{_ordinal(math.floor(p * 100))} percentile" if p < 1 else "highest"


def explain(c: Candidate, qualifying: int, ranked: int, as_of: int) -> str:
    """One sentence on why a candidate was or wasn't picked, from its own numbers."""
    if c.status in ("selected", "qualified"):
        gap = c.close / c.average - 1
        place = f"Ranked {_ordinal(c.rank)} of {qualifying} qualifying stock{'s' if qualifying != 1 else ''}"
        momentum = f"12-1 momentum of {_signed(c.momentum)} ({_percentile(c.percentile)} of {ranked} ranked)"
        trend = f"its {_day(as_of)} close was {gap * 100:.1f}% above its 200-day average"
        if c.status == "selected":
            return f"{place}, with {momentum}, and {trend}."
        return f"{place}: it qualified, but only the top {MAX_HOLDINGS} are held."
    if c.status == "low-momentum":
        below = "" if c.close > c.average else ", and it was below its 200-day average"
        return f"12-1 momentum of {_signed(c.momentum)} was at the {_percentile(c.percentile)}, under the top fifth needed{below}."
    if c.status == "below-average":
        return f"Momentum was in the top fifth ({_percentile(c.percentile)}), but its {_day(as_of)} close was {(1 - c.close / c.average) * 100:.1f}% below its 200-day average."
    if c.status == "short-history":
        return f"Not enough history: {c.closes} of the {MOMENTUM_SESSIONS} daily closes 12-1 momentum needs."
    if c.status == "no-price":
        return f"No price on {_day(as_of)}, the latest session, so it couldn't be ranked."
    return f"No prices through {_day(as_of)}."


# ---------------------------------------------------------------------------
# The simulation
# ---------------------------------------------------------------------------


def _month(ms: int) -> tuple[int, int]:
    d = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return d.year, d.month


def decision_days(calendar: Sequence[int], first: int) -> list[int]:
    """Session indices to decide on: `first`, then the first session of every later calendar month."""
    return [first] + [d for d in range(first + 1, len(calendar)) if _month(calendar[d]) != _month(calendar[d - 1])]


def first_rankable(closes: Mapping[str, Sequence[float | None]], start: int, stop: int) -> int | None:
    """
    The first session from `start` to `stop` (exclusive) on which some
    candidate could be ranked: one with a close on the session before it and
    MOMENTUM_SESSIONS closes in all by then (`_measure`'s conditions).
    """
    ready: list[tuple[int, Sequence[float | None]]] = []  # the session of each stock's 253rd close
    for prices in closes.values():
        seen = 0
        for i, p in enumerate(prices):
            if p is not None:
                seen += 1
                if seen == MOMENTUM_SESSIONS:
                    ready.append((i, prices))
                    break
    for day in range(max(start, 1), stop):
        if any(i <= day - 1 and prices[day - 1] is not None for i, prices in ready):
            return day
    return None


def _trade_row(t: Trade, close: float) -> dict[str, Any]:
    slippage = abs(t.price - close) * t.shares
    return {
        "time": t.time,
        "symbol": t.symbol,
        "side": t.side,
        "shares": t.shares,
        "price": t.price,
        "close": close,
        "value": t.shares * t.price,
        "commission": t.commission,
        "slippage": slippage,
    }


def _costs_of(trades: Sequence[Trade], closes: Mapping[int, float]) -> dict[str, float]:
    """Commissions and slippage of a run's trades, against the closes they filled at."""
    commission = sum(t.commission for t in trades)
    slippage = sum(abs(t.price - closes[t.time]) * t.shares for t in trades)
    return {"commission": commission, "slippage": slippage, "total": commission + slippage}


def _round(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def _run_json(equity: list[tuple[int, float]], trades: list[Trade], metrics) -> dict[str, Any]:
    from .saved import run_json  # the saved-run shape, shared with backtests

    return run_json(engine.Run(equity=equity, trades=trades, metrics=metrics))


def run_screen(snapshot: Mapping[str, Any], settings: Settings) -> dict[str, Any]:
    """
    Runs the monthly screen over a universe snapshot: every decision, trade
    and day's value, the benchmark over the same days, and the monthly
    history with its explanations. A pure function of its arguments (apart
    from `computedAt`, which the caller adds).
    """
    check_snapshot(snapshot)
    calendar: list[int] = snapshot["calendar"]
    closes: Mapping[str, list[float | None]] = snapshot["closes"]
    if not closes:
        raise ScreenError("There are no candidate stocks.")
    if len(closes) > MAX_UNIVERSE:
        raise ScreenError(f"At most {MAX_UNIVERSE} candidate stocks can be screened.")
    costs = settings.costs
    warnings: list[str] = []

    requested = next((i for i, t in enumerate(calendar) if t >= settings.start), None)
    last = max((i for i, t in enumerate(calendar) if t <= settings.end), default=None)
    if requested is None or last is None or last - requested < 1:
        raise ScreenError("There aren't at least two trading days in that date range.")
    first = first_rankable(closes, requested, last)
    if first is None:
        raise ScreenError(
            f"No stock has the {MOMENTUM_SESSIONS} daily closes (about a year) 12-1 momentum needs before {_day(calendar[last])}. "
            f"The prices begin on {_day(calendar[0])}; choose a later end date."
        )
    if first > requested:
        warnings.append(
            f"Not enough earlier history to rank stocks on {_day(calendar[requested])}: momentum needs {MOMENTUM_SESSIONS} daily closes "
            f"(about a year), and the prices begin on {_day(calendar[0])}. Results start on {_day(calendar[first])}, the first day a stock could be ranked."
        )
    if calendar[last] < settings.end and _month(calendar[last]) != _month(settings.end):
        warnings.append(f"Prices end on {_day(calendar[last])}, so results stop there.")

    deciding = set(decision_days(calendar[: last + 1], first))
    portfolio = Portfolio(cash=float(settings.initial_cash), shares={})
    marks: dict[str, float] = {}  # each held stock's latest close, for valuing it on a day it has none
    to_sell: set[str] = set()  # stocks to sell that had no price when they were due
    trades: list[Trade] = []
    equity: list[tuple[int, float]] = []
    months: list[dict[str, Any]] = []
    invested = 0
    previous: list[str] = []

    for day in range(first, last + 1):
        when = calendar[day]
        today = {s: p[day] for s, p in closes.items() if p[day] is not None}
        for s in portfolio.shares:
            if s in today:
                marks[s] = today[s]
        made: list[tuple[Trade, float]] = []

        if day in deciding:
            # 1. Decide, from closes before this session only.
            candidates = rank({s: p[:day] for s, p in closes.items()})
            as_of = calendar[day - 1]
            picks = [c for c in candidates if c.status == "selected"]
            pick_symbols = [c.symbol for c in picks]
            qualifying = sum(1 for c in candidates if c.rank is not None)
            ranked = sum(1 for c in candidates if c.momentum is not None)
            notes: list[str] = []

            # 2. Execute at this session's close: sells first, then buys in rank order.
            total = portfolio.cash + sum(n * marks[s] for s, n in portfolio.shares.items())
            held = [s for s, n in portfolio.shares.items() if n > 0]
            for s in held:
                if s not in pick_symbols:
                    if s in today:
                        if t := sell(portfolio, when, s, portfolio.shares[s] * today[s], today[s], costs, exit=True):
                            made.append((t, today[s]))
                        to_sell.discard(s)
                    else:
                        to_sell.add(s)
                        notes.append(f"{s} had no price on {_day(when)}, so it stays held until the next day it trades, and is sold then.")
                elif s in today and (excess := portfolio.shares[s] * today[s] - WEIGHT * total) > 0:
                    if t := sell(portfolio, when, s, excess, today[s], costs):
                        made.append((t, today[s]))
            for c in picks:
                s = c.symbol
                to_sell.discard(s)
                if s not in today:
                    notes.append(
                        f"{s} had no price on {_day(when)}, so "
                        + ("its shares were kept as they were." if portfolio.shares.get(s, 0) > 0 else "it wasn't bought; its 20% stays in cash until next month.")
                    )
                    continue
                portfolio.shares.setdefault(s, 0.0)
                if (gap := WEIGHT * total - portfolio.shares[s] * today[s]) > 0 and (t := buy(portfolio, when, s, gap, today[s], costs)):
                    made.append((t, today[s]))
                marks[s] = today[s]

            unused = MAX_HOLDINGS - len(picks)
            if unused:
                notes.append(f"Only {len(picks)} stock{'s' if len(picks) != 1 else ''} qualified, so {unused * 20}% was left in cash.")
            explained = {c.symbol: explain(c, qualifying, ranked, as_of) for c in candidates if c.status == "selected" or c.symbol in previous}
            months.append(
                {
                    "decision": when,
                    "basedOn": as_of,
                    "candidates": len(candidates),
                    "ranked": ranked,
                    "qualifying": qualifying,
                    "selected": [
                        {"symbol": c.symbol, "rank": c.rank, "momentum": c.momentum, "percentile": c.percentile, "close": c.close, "average": c.average, "weight": WEIGHT, "explanation": explained[c.symbol]}
                        for c in picks
                    ],
                    "entered": [s for s in pick_symbols if s not in previous],
                    "left": [{"symbol": s, "explanation": explained[s]} for s in previous if s not in pick_symbols],
                    "kept": [s for s in pick_symbols if s in previous],
                    "notes": notes,
                    # Every candidate, for "why wasn't X picked?", rounded for display (the snapshot keeps every
                    # input exactly): [symbol, status, momentum, percentile, close, average, closes]
                    "table": [[c.symbol, c.status, _round(c.momentum, 5), _round(c.percentile, 4), _round(c.close, 2), _round(c.average, 2), c.closes] for c in candidates],
                    "trades": [],
                }
            )
            previous = pick_symbols
        else:
            # Between decisions, only a sale that was waiting for a price.
            for s in sorted(to_sell):
                if s in today and portfolio.shares.get(s, 0) > 0:
                    if t := sell(portfolio, when, s, portfolio.shares[s] * today[s], today[s], costs, exit=True):
                        made.append((t, today[s]))
                    to_sell.discard(s)
                    months[-1]["notes"].append(f"{s} was sold on {_day(when)}, the first day after the decision that it had a price.")

        for t, close in made:
            trades.append(t)
            months[-1]["trades"].append(_trade_row(t, close))
        for s in [s for s, n in portfolio.shares.items() if n == 0 and s not in pick_symbols]:
            del portfolio.shares[s]  # sold out: no longer a position

        # 3. Value at this session's close (a held stock without one, at its latest).
        holdings = 0.0
        for s, n in portfolio.shares.items():
            holdings = holdings + n * marks[s]
        total_value = portfolio.cash + holdings
        if holdings > 0:
            invested += 1
        equity.append((when, total_value))
        if day in deciding:
            months[-1]["cash"] = portfolio.cash
            months[-1]["value"] = total_value

    stale = [s for s, n in portfolio.shares.items() if n > 0 and closes[s][last] is None]
    for s in stale:
        warnings.append(f"{s} had no price on {_day(calendar[last])}, the last day, so it's valued at its latest close.")

    metrics = compute_metrics(equity, len(trades), invested / len(equity))
    benchmark = engine.run_backtest(
        {MARKET: engine.to_series(MARKET, calendar, snapshot["market"]["prices"])},
        engine.BuyAndHold({MARKET: 1.0}),
        start=calendar[first],
        end=calendar[last],
        initial_cash=settings.initial_cash,
        costs=costs,
    )

    rows = [r for m in months for r in m["trades"]]
    commission = sum(r["commission"] for r in rows)
    slippage = sum(r["slippage"] for r in rows)
    sold = sum(r["value"] for r in rows if r["side"] == "sell")
    years = (calendar[last] - calendar[first]) / YEAR_MS
    average_value = sum(v for _, v in equity) / len(equity)
    for m in months:
        m["commission"] = sum(r["commission"] for r in m["trades"])
        m["slippage"] = sum(r["slippage"] for r in m["trades"])

    simulated = snapshot["simulated"]
    return {
        "kind": "historical-screen",
        "preset": PRESET,
        "settings": {
            "start": settings.start,
            "end": settings.end,
            "initialCash": settings.initial_cash,
            "costs": {"commission": costs.commission, "slippageBps": costs.slippage_bps},
        },
        "period": {
            "requestedStart": settings.start,
            "requestedEnd": settings.end,
            "start": calendar[first],
            "end": calendar[last],
            "sessions": last - first + 1,
            "dataStart": calendar[0],
            "warmupSessions": first,
        },
        "warnings": warnings,
        "run": _run_json(equity, trades, metrics),
        "benchmark": {
            **_run_json(benchmark.equity, benchmark.trades, benchmark.metrics),
            "symbol": snapshot["market"]["symbol"],
            "name": snapshot["market"]["name"],
            # The mock market's indices are price indices; with real data the index is its fund's adjusted price.
            "dividends": "excluded" if simulated else "included",
            "costs": _costs_of(benchmark.trades, dict(zip(calendar, snapshot["market"]["prices"]))),
        },
        "costs": {"commission": commission, "slippage": slippage, "total": commission + slippage},
        "turnover": sold / average_value / years if years > 0 else None,
        "traded": sum(r["value"] for r in rows),
        "months": months,
        "universe": {"symbols": sorted(closes), "count": len(closes), "neverPriced": sorted(s for s, p in closes.items() if all(v is None for v in p))},
    }


def provenance(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "engine": {"name": engine.ENGINE_NAME, "version": engine.ENGINE_VERSION},
        "method": {"name": SCREEN_NAME, "version": SCREEN_VERSION},
        "dataset": describe_snapshot(snapshot),
        "assumptions": ASSUMPTIONS,
        "computedAt": int(time.time() * 1000),
    }


def summary_of(result: Mapping[str, Any]) -> dict[str, float]:
    """The headline numbers a saved run keeps for lists (the same keys as a backtest's)."""
    m = result["run"]["metrics"]
    return {
        "finalValue": m["finalValue"],
        "totalReturn": m["totalReturn"],
        "cagr": m["cagr"],
        "maxDrawdown": m["maxDrawdown"],
        "benchmarkTotalReturn": result["benchmark"]["metrics"]["totalReturn"],
    }


def compare(stored: Mapping[str, Any], reproduced: Mapping[str, Any]) -> dict[str, Any]:
    """
    Compares a reproduced result with the stored one: the curves, trades and
    metrics as a backtest's are compared (saved.compare), and every month's
    picks, which must be identical.
    """
    from .saved import compare as compare_runs

    out = compare_runs(stored, reproduced)
    differences = list(out["differences"])
    was, now = stored["months"], reproduced["months"]
    if len(was) != len(now):
        differences.append(f"{len(was)} monthly selections stored, {len(now)} reproduced")
    else:
        for a, b in zip(was, now):
            if a["decision"] != b["decision"] or [s["symbol"] for s in a["selected"]] != [s["symbol"] for s in b["selected"]]:
                differences.append(f"The selection on {_day(a['decision'])} differs")
            elif [r[:2] for r in a["table"]] != [r[:2] for r in b["table"]]:
                differences.append(f"The candidates' ranking on {_day(a['decision'])} differs")
    return {"matches": not differences, "largestDifference": out["largestDifference"], "differences": differences[:5]}
