"""
What each paper option position is worth at the latest close (its "mark"),
stored on option_position: Black-Scholes on the stock's close and past-year
volatility, the same way the simulated chain is priced (options.py). The
Next.js side reads the stored marks for portfolio totals, so the pricing
stays here, in one place.

Runs nightly (jobs.py, before the snapshots, which value options at their
marks), and on demand for one owner when a page finds marks behind the
latest close.
"""

from __future__ import annotations

import time
from typing import Any

from . import options, store
from .db import Database

DAY_MS = 86_400_000


def mark(kind: options.Kind, strike: float, expiry_ms: int, spot: float, vol: float, as_of_ms: int, q: float = 0.0) -> tuple[float, float]:
    """The price per share and delta of one contract at a close."""
    years = max(0.0, (expiry_ms - as_of_ms) / (365 * DAY_MS))
    priced = options.black_scholes(kind, spot, strike, years, vol, options.RISK_FREE, q)
    return round(priced["price"], 4), round(priced["delta"], 4)


def run(db: Database, source: str, budget_ms: int = 5000, owner: str | None = None) -> dict[str, Any]:
    """Marks every position (or one owner's) whose mark is older than its stock's latest close."""
    start = time.monotonic()
    where, args = ("WHERE user_id = ?", [owner]) if owner else ("", [])
    rows = db.query(f"SELECT user_id, id, symbol, kind, strike, expiry, marked_at FROM option_position {where}", args)
    symbols = sorted({r["symbol"] for r in rows})
    index = store.series_index(db, source, symbols)
    due = [r for r in rows if r["symbol"] in index and (r["marked_at"] is None or int(r["marked_at"]) < index[r["symbol"]].last_time)]
    marked = 0
    failed: dict[str, str] = {}
    out: list[dict[str, Any]] = []
    by_symbol: dict[str, list[dict[str, Any]]] = {}
    for r in due:
        by_symbol.setdefault(r["symbol"], []).append(r)
    updates: list[tuple[str, list[Any]]] = []
    for symbol, positions in by_symbol.items():
        if (time.monotonic() - start) * 1000 > budget_ms:
            break
        bars = store.load_bars(db, source, [symbol], index[symbol].last_time - 400 * DAY_MS).get(symbol)
        if bars is None or bars.empty:
            continue
        yields = db.query("SELECT dividend_yield FROM price_series WHERE source = ? AND symbol = ?", [source, symbol])
        q = float(yields[0]["dividend_yield"] or 0.0) if yields else 0.0
        as_of = int(bars.index[-1])
        try:
            vol = options.volatility_of(bars["adj_close"].tolist())
        except options.OptionError as error:
            failed[symbol] = str(error)
            continue
        spot = float(bars["close"].iloc[-1])
        for p in positions:
            price, delta = mark(p["kind"], float(p["strike"]), int(p["expiry"]), spot, vol, as_of, q)
            updates.append(("UPDATE option_position SET mark = ?, marked_at = ?, delta = ? WHERE user_id = ? AND id = ?", [price, as_of, delta, p["user_id"], p["id"]]))
            out.append({"id": p["id"], "mark": price, "markedAt": as_of, "delta": delta})
            marked += 1
    if updates:
        db.execute_many(updates)
    return {"marked": marked, "remaining": len(due) - marked, "failed": failed, "marks": out if owner else None}
