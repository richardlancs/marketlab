"""
Nightly portfolio snapshots: each simulated portfolio's value at each daily
close, stored in portfolio_value.

The Next.js daily job brings every account up to date first (fills,
dividends, splits: lib/processing.ts), then asks for this. Each run:

1. snapshots, at the latest close, every portfolio that's up to date with it
   and doesn't have that close yet;
2. backfills portfolios with no snapshots at all, rebuilding their value on
   every close since they started from their trades (performance.py), so a
   portfolio's record starts complete.

Both stop within a time budget and pick up where they left off next time.
Values use each stock's close as traded (not adjusted), like the trading
code, carrying the last close over days a stock has none.
"""

from __future__ import annotations

import time
from collections.abc import Iterable
from typing import Any

from . import performance, store
from .db import Database

#: Accounts handled per database round trip.
BATCH = 50
DAY_MS = 86_400_000


def _accounts(db: Database, ids: list[str]) -> dict[str, dict[str, Any]]:
    """The accounts, in the shape performance.py takes."""
    if not ids:
        return {}
    marks = ",".join("?" for _ in ids)
    out: dict[str, dict[str, Any]] = {
        r["user_id"]: {"cash": float(r["cash"]), "holdings": [], "trades": [], "events": [], "options": [], "createdAt": int(r["created_at"] or 0)}
        for r in db.query(f"SELECT user_id, cash, created_at FROM portfolio WHERE user_id IN ({marks})", ids)
    }
    for r in db.query(f"SELECT user_id, symbol, shares FROM holding WHERE user_id IN ({marks})", ids):
        out[r["user_id"]]["holdings"].append({"symbol": r["symbol"], "shares": float(r["shares"])})
    for r in db.query(f"SELECT user_id, symbol, side, shares, price, time, option_kind, strike, expiry FROM trade WHERE user_id IN ({marks}) ORDER BY time DESC", ids):
        option = {"kind": r["option_kind"], "strike": float(r["strike"]), "expiry": int(r["expiry"])} if r["option_kind"] else None
        out[r["user_id"]]["trades"].append({"symbol": r["symbol"], "side": r["side"], "shares": float(r["shares"]), "price": float(r["price"]), "time": int(r["time"]), "option": option})
    for r in db.query(f"SELECT user_id, symbol, kind, strike, expiry, contracts, mark FROM option_position WHERE user_id IN ({marks})", ids):
        out[r["user_id"]]["options"].append({"symbol": r["symbol"], "kind": r["kind"], "strike": float(r["strike"]), "expiry": int(r["expiry"]), "contracts": float(r["contracts"]), "mark": None if r["mark"] is None else float(r["mark"])})
    for r in db.query(f"SELECT user_id, kind, symbol, time, shares, cash FROM account_event WHERE user_id IN ({marks}) ORDER BY time DESC", ids):
        out[r["user_id"]]["events"].append({"kind": r["kind"], "symbol": r["symbol"], "time": int(r["time"]), "shares": float(r["shares"]), "cash": float(r["cash"])})
    return out


def _closes(db: Database, source: str, symbols: Iterable[str], since: int) -> dict[str, list[tuple[int, float]]]:
    """Each symbol's closes as traded from `since` (with one earlier close, to carry over), oldest first."""
    wanted = sorted(set(symbols))
    if not wanted:
        return {}
    bars = store.load_bars(db, source, wanted, since - 10 * DAY_MS)
    return {s: list(zip((int(t) for t in b.index), (float(v) for v in b["close"]))) for s, b in bars.items()}


def _insert(db: Database, rows: list[tuple[str, int, float, float]]) -> None:
    if rows:
        db.execute_many([("INSERT INTO portfolio_value (user_id, time, value, cash) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, time) DO UPDATE SET value = excluded.value, cash = excluded.cash", r) for r in rows])


def run(db: Database, source: str, budget_ms: int = 8000) -> dict[str, Any]:
    start = time.monotonic()
    over = lambda: (time.monotonic() - start) * 1000 > budget_ms  # noqa: E731
    index = store.series_index(db, source, [store.MARKET])
    if store.MARKET not in index:
        return {"status": "no-prices", "snapshotted": 0, "backfilled": 0, "remaining": 0}
    latest = index[store.MARKET].last_time
    market = store.load_closes(db, source, [store.MARKET], 0, latest).get(store.MARKET)
    sessions = [int(t) for t in market.index] if market is not None else []

    # 1. Up-to-date portfolios without today's snapshot (but with earlier ones: the rest are backfilled whole).
    due = [r["user_id"] for r in db.query(
        "SELECT p.user_id FROM portfolio p WHERE p.processed_through >= ? "
        "AND NOT EXISTS (SELECT 1 FROM portfolio_value v WHERE v.user_id = p.user_id AND v.time = ?) "
        "AND EXISTS (SELECT 1 FROM portfolio_value v WHERE v.user_id = p.user_id)",
        [latest, latest],
    )]
    snapshotted = 0
    left = 0
    for i in range(0, len(due), BATCH):
        if over():
            left = len(due) - i
            break
        accounts = _accounts(db, due[i : i + BATCH])
        closes = _closes(db, source, (s for a in accounts.values() for s in [*(h["symbol"] for h in a["holdings"]), *(o["symbol"] for o in a["options"])]), latest)
        rows = []
        for user, account in accounts.items():
            try:
                value = performance.value_series({**account, "trades": [], "events": []}, closes, [latest])[0]
            except performance.MissingPrices:
                continue
            rows.append((user, latest, value, account["cash"]))
        _insert(db, rows)
        snapshotted += len(rows)

    # 2. Backfill portfolios with no snapshots yet, from when they started.
    fresh = [r["user_id"] for r in db.query(
        "SELECT p.user_id FROM portfolio p WHERE p.processed_through >= ? AND NOT EXISTS (SELECT 1 FROM portfolio_value v WHERE v.user_id = p.user_id) ORDER BY p.user_id",
        [latest],
    )]
    backfilled = 0
    remaining = 0
    for i in range(0, len(fresh), 10):
        if over():
            remaining = len(fresh) - i
            break
        accounts = _accounts(db, fresh[i : i + 10])
        for user, account in accounts.items():
            starts = [t for t in (account["createdAt"], performance.first_trade_time(account)) if t]
            began = min(starts) if starts else latest
            days = [t for t in sessions if t >= began - DAY_MS] or [latest]
            symbols = performance.relevant_symbols(account)
            closes = _closes(db, source, symbols, days[0])
            try:
                values = performance.value_series(account, closes, days)
            except performance.MissingPrices:
                continue
            states = performance.holdings_timeline(account, days)
            _insert(db, [(user, t, v, s.cash) for t, v, s in zip(days, values, states)])
            backfilled += 1
    return {"status": "ok", "asOf": latest, "snapshotted": snapshotted, "backfilled": backfilled, "remaining": left + remaining}


def stored_values(db: Database, owner_id: str, since: int, until: int) -> dict[int, float]:
    """An owner's stored values by close time, within the range."""
    rows = db.query("SELECT time, value FROM portfolio_value WHERE user_id = ? AND time >= ? AND time <= ?", [owner_id, since, until])
    return {int(r["time"]): float(r["value"]) for r in rows}
