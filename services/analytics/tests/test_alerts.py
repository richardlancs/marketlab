"""Indicator alerts (alerts.py): the same triggers as the Next.js alert code, and the nightly check."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from analytics import alerts, db as database

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "alerts.json").read_text())
DAY = 86_400_000
T0 = 1_700_000_000_000


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=[f"{c['condition']['kind']}-{c['condition'].get('days', c['condition'].get('percent', ''))}-{c['direction']}" for c in FIXTURE["cases"]])
def test_triggers_on_the_same_sessions_as_before(case):
    closes = FIXTURE["closes"]
    cache: dict = {}
    hits = [i for i in range(len(closes)) if alerts.condition_met(case["condition"], case["direction"], closes, i, cache)]
    assert hits == case["hits"]


def test_split_adjusted_closes_undo_splits_but_not_dividends():
    close = np.array([100.0, 102.0, 51.0, 52.0, 52.5])  # a 2-for-1 split before day 2
    dividend = np.array([0.99, 0.99, 1.0, 1.0, 1.0])  # a small dividend before day 2 as well
    adj = close / np.array([2.0, 2.0, 1.0, 1.0, 1.0]) * dividend
    bars = pd.DataFrame({"close": close, "adj_close": adj}, index=[T0 + i * DAY for i in range(5)])
    assert alerts.split_adjusted(bars) == pytest.approx([50.0, 51.0, 51.0, 52.0, 52.5])


@pytest.fixture
def db(tmp_path):
    sqlite = database.SqliteDatabase(tmp_path / "test.db")
    for migration in sorted((ROOT / "drizzle").glob("*.sql")):
        for statement in migration.read_text().split("--> statement-breakpoint"):
            if statement.strip():
                sqlite.execute(statement)
    sqlite.execute("INSERT INTO user (id, name, email) VALUES ('u1', 'A', 'a@example.com')")
    closes = [100.0] * 30 + [107.0, 108.0, 100.0, 99.0]
    sqlite.execute_many([("INSERT INTO daily_bar (source, symbol, time, open, high, low, close, adj_close, volume) VALUES ('mock', 'AAA', ?, ?, ?, ?, ?, ?, 1)", (T0 + i * DAY, c, c, c, c, c)) for i, c in enumerate(closes)])
    return sqlite


def alert(db, id_, condition, direction="above", created=T0, price=0.0):
    db.execute("INSERT INTO price_alert (id, user_id, symbol, direction, price, condition, created_at) VALUES (?, 'u1', 'AAA', ?, ?, ?, ?)", [id_, direction, price, json.dumps(condition), created])


def test_the_nightly_check_triggers_on_the_first_close_after_creation(db):
    alert(db, "move-up", {"kind": "move", "percent": 5})
    alert(db, "move-down", {"kind": "move", "percent": 5}, "below")
    alert(db, "too-late", {"kind": "move", "percent": 5}, created=T0 + 31 * DAY)
    alert(db, "price", None, price=105)
    db.execute("UPDATE price_alert SET condition = NULL WHERE id = 'price'")
    summary = alerts.evaluate(db, "mock")
    assert summary == {"checked": 3, "triggered": 2, "unfinished": 0}
    rows = {r["id"]: r for r in db.query("SELECT id, triggered_at, trigger_price FROM price_alert")}
    assert (rows["move-up"]["triggered_at"], rows["move-up"]["trigger_price"]) == (T0 + 30 * DAY, 107.0)
    assert rows["move-down"]["triggered_at"] == T0 + 32 * DAY
    assert rows["too-late"]["triggered_at"] is None and rows["price"]["triggered_at"] is None
    # Running again changes nothing.
    assert alerts.evaluate(db, "mock")["triggered"] == 0
