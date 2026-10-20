"""
Saved backtests, done by the analytics service: calculating a run's result
and saving it with its input prices, and reproducing a saved run from the
database. The stored JSON has exactly the shape MarketLab's TypeScript side
stores and reads (lib/backtest/stored.ts, lib/backtest/snapshot.ts), so a
run saved by either side opens the same way.
"""

from __future__ import annotations

import json
import math
import time
from typing import Any, Mapping

from . import db as database
from . import engine

#: Relative tolerance when comparing a reproduced result with the stored one (as lib/backtest/stored.ts).
TOLERANCE = 1e-9


def _cents(value: float) -> float:
    """Rounds to the cent like JavaScript's Math.round (halves up), which the Next.js side uses."""
    return math.floor(value * 100 + 0.5) / 100


def run_json(run: engine.Run) -> dict[str, Any]:
    """A run as MarketLab's TypeScript types have it (camelCase), with values to the cent like the Next.js side."""
    m = run.metrics
    return {
        "equity": [{"time": t, "price": _cents(v)} for t, v in run.equity],
        "trades": [{"time": t.time, "symbol": t.symbol, "side": t.side, "shares": t.shares, "price": t.price, "commission": t.commission} for t in run.trades],
        "metrics": {
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
        },
    }


def outcome_from_snapshot(config: engine.Config, snapshot: Mapping[str, Any]) -> engine.Outcome:
    """Runs a config on a stored snapshot's prices."""
    prices = {symbol: engine.to_series(symbol, s["times"], s["prices"]) for symbol, s in snapshot["series"].items()}
    market = snapshot.get("market")
    market_series = engine.to_series("Market", market["data"]["times"], market["data"]["prices"]) if market else None
    return engine.run_config(config, prices, market_series)


def summary_of(outcome: engine.Outcome) -> dict[str, float]:
    """The headline numbers a saved run keeps for the list (lib/backtest/config.ts summarize)."""
    m = outcome.run.metrics
    return {
        "finalValue": m.final_value,
        "totalReturn": m.total_return,
        "cagr": m.cagr,
        "maxDrawdown": m.max_drawdown,
        "benchmarkTotalReturn": outcome.benchmark.metrics.total_return,
    }


def stored_result(outcome: engine.Outcome, *, note: str | None, dataset: Mapping[str, Any], assumptions: Mapping[str, str]) -> dict[str, Any]:
    # The Next.js server sends the full note (including these same warnings); on its own, the engine's warnings are the note.
    full_note = note if note is not None else (" ".join(outcome.warnings) or None)
    return {
        "outcome": {"run": run_json(outcome.run), "benchmark": run_json(outcome.benchmark)},
        "note": full_note,
        "provenance": {
            "engine": {"name": engine.ENGINE_NAME, "version": engine.ENGINE_VERSION},
            "dataset": dict(dataset),
            "assumptions": dict(assumptions),
            "computedAt": int(time.time() * 1000),
        },
    }


def compare(stored: Mapping[str, Any], reproduced: Mapping[str, Any]) -> dict[str, Any]:
    """Compares a reproduced outcome with the stored one (the same rules as lib/backtest/stored.ts compareResults)."""
    differences: list[str] = []
    largest = 0.0

    def number(a, b, what):
        nonlocal largest
        if a is None or b is None:
            if a != b:
                differences.append(f"{what}: {a} vs {b}")
            return
        relative = abs(a - b) / max(abs(b), 1e-12)
        largest = max(largest, 0.0 if abs(a - b) <= 1e-12 else relative)
        if abs(a - b) > 1e-9 and relative > TOLERANCE:
            differences.append(f"{what}: stored {b}, reproduced {a}")

    for side in ("run", "benchmark"):
        was, now = stored[side], reproduced[side]
        if [p["time"] for p in was["equity"]] != [p["time"] for p in now["equity"]]:
            differences.append(f"{side}: different days ({len(was['equity'])} stored, {len(now['equity'])} reproduced)")
            continue
        for i, (p, q) in enumerate(zip(now["equity"], was["equity"])):
            number(p["price"], q["price"], f"{side} value on day {i + 1}")
        if len(was["trades"]) != len(now["trades"]):
            differences.append(f"{side}: {len(was['trades'])} trades stored, {len(now['trades'])} reproduced")
        else:
            for i, (t, u) in enumerate(zip(now["trades"], was["trades"])):
                if (t["time"], t["symbol"], t["side"]) != (u["time"], u["symbol"], u["side"]):
                    differences.append(f"{side} trade {i + 1} differs")
                number(t["shares"], u["shares"], f"{side} trade {i + 1} shares")
                number(t["price"], u["price"], f"{side} trade {i + 1} price")
        for key in ("finalValue", "totalReturn", "cagr", "maxDrawdown", "volatility", "sharpe", "exposure"):
            number(now["metrics"][key], was["metrics"][key], f"{side} {key}")
    return {"matches": not differences, "largestDifference": largest, "differences": differences[:5]}


class NotFound(LookupError):
    pass


class NotReproducible(ValueError):
    pass


def reproduce(db: database.Database, owner_id: str, run_id: str, to_config) -> dict[str, Any]:
    """
    Reads a saved run and its snapshot from the database (the owner's only),
    calculates it again from the saved prices, and compares. `to_config`
    turns the stored settings into an engine.Config (validating them).
    """
    row = database.load_saved_run(db, owner_id, run_id)
    if row is None:
        raise NotFound("That saved run doesn't exist.")
    if not row["result"] or not row["snapshot"]:
        raise NotReproducible("This run was saved before MarketLab kept results and their input prices, so it can't be reproduced.")
    if row["engine"] != engine.ENGINE_NAME:
        raise NotReproducible(f"This run was calculated by the {row['engine']} engine, so it's reproduced there.")
    stored = json.loads(row["result"])
    snapshot = json.loads(row["snapshot"])
    outcome = outcome_from_snapshot(to_config(json.loads(row["config"])), snapshot)
    reproduced = stored_result(outcome, note=None, dataset=stored["provenance"]["dataset"], assumptions=stored["provenance"]["assumptions"])
    reproduced["note"] = stored.get("note")
    return {"reproduced": reproduced, "comparison": compare(stored["outcome"], reproduced["outcome"])}
