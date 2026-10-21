"""
Database access for the analytics service: MarketLab's own database (the
same tables as lib/db/schema.ts), for saved backtests and their price
snapshots.

- Locally, DATABASE_URL is unset (or "file:..."): the SQLite file
  `local.db` at the repository root, through Python's sqlite3.
- Online, DATABASE_URL is a Turso URL (libsql://...) with
  DATABASE_AUTH_TOKEN: Turso's HTTP API (/v2/pipeline), through httpx. No
  native driver, so nothing to compile on Vercel.

Ownership: the service never decides who's asking. MarketLab's Next.js
server checks the session or guest cookie and sends the owner's ID with
each request, authenticated by the service token (analytics/api.py); every
query here is limited to that owner's rows.

Every write is a single SQL statement, so it's atomic on its own: a run is
inserted only if its owner exists and has room under MAX_SAVED_RUNS.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Protocol, Sequence

import httpx

#: The most saved runs a user may have (lib/backtest/config.ts).
MAX_SAVED_RUNS = 50
REPO_ROOT = Path(__file__).resolve().parents[3]


class DatabaseError(RuntimeError):
    """The database couldn't be reached or refused a query."""


class Database(Protocol):
    def query(self, sql: str, args: Sequence[Any] = ()) -> list[dict[str, Any]]: ...
    def execute(self, sql: str, args: Sequence[Any] = ()) -> int:
        """Runs a write; returns the number of rows it changed."""

    def execute_many(self, statements: Sequence[tuple[str, Sequence[Any]]]) -> None:
        """Runs several writes as one transaction: all of them, or (on any error) none."""


class SqliteDatabase:
    def __init__(self, path: str | Path):
        self.path = str(path)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        return connection

    def query(self, sql: str, args: Sequence[Any] = ()) -> list[dict[str, Any]]:
        with self._connect() as c:
            return [dict(row) for row in c.execute(sql, tuple(args)).fetchall()]

    def execute(self, sql: str, args: Sequence[Any] = ()) -> int:
        connection = self._connect()
        try:
            with connection:  # commits, or rolls back on error
                return connection.execute(sql, tuple(args)).rowcount
        finally:
            connection.close()

    def execute_many(self, statements: Sequence[tuple[str, Sequence[Any]]]) -> None:
        connection = self._connect()
        try:
            with connection:
                for sql, args in statements:
                    connection.execute(sql, tuple(args))
        finally:
            connection.close()


def _encode(value: Any) -> dict[str, Any]:
    """A value as Turso's HTTP API takes it: integers as strings (no precision lost), floats as numbers."""
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": "1" if value else "0"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    return {"type": "text", "value": str(value)}


def _decode(cell: dict[str, Any]) -> Any:
    kind = cell.get("type")
    if kind == "null":
        return None
    if kind == "integer":
        return int(cell["value"])
    if kind == "float":
        return float(cell["value"])
    return cell.get("value")


class TursoDatabase:
    """Turso over its HTTP API: one request per statement, each atomic."""

    def __init__(self, url: str, token: str | None, client: httpx.Client | None = None, timeout: float = 8.0):
        self.endpoint = url.replace("libsql://", "https://", 1).rstrip("/") + "/v2/pipeline"
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}
        self.client = client or httpx.Client(timeout=timeout)

    def _run(self, sql: str, args: Sequence[Any]) -> dict[str, Any]:
        body = {"requests": [{"type": "execute", "stmt": {"sql": sql, "args": [_encode(a) for a in args]}}, {"type": "close"}]}
        try:
            response = self.client.post(self.endpoint, json=body, headers=self.headers)
        except httpx.HTTPError as error:
            raise DatabaseError(f"The database couldn't be reached: {error}") from error
        if response.status_code != 200:
            raise DatabaseError(f"The database answered {response.status_code}.")
        result = response.json()["results"][0]
        if result.get("type") != "ok":
            raise DatabaseError(f"The database refused a query: {result.get('error', {}).get('message', 'unknown error')}")
        return result["response"]["result"]

    def query(self, sql: str, args: Sequence[Any] = ()) -> list[dict[str, Any]]:
        result = self._run(sql, args)
        names = [c["name"] for c in result["cols"]]
        return [{name: _decode(cell) for name, cell in zip(names, row)} for row in result["rows"]]

    def execute(self, sql: str, args: Sequence[Any] = ()) -> int:
        return int(self._run(sql, args).get("affected_row_count", 0))

    def execute_many(self, statements: Sequence[tuple[str, Sequence[Any]]]) -> None:
        """One HTTP request: BEGIN, the statements, COMMIT. If any fails, closing the stream rolls the rest back."""
        steps = [{"type": "execute", "stmt": {"sql": "BEGIN"}}]
        steps += [{"type": "execute", "stmt": {"sql": sql, "args": [_encode(a) for a in args]}} for sql, args in statements]
        steps += [{"type": "execute", "stmt": {"sql": "COMMIT"}}, {"type": "close"}]
        try:
            response = self.client.post(self.endpoint, json={"requests": steps}, headers=self.headers)
        except httpx.HTTPError as error:
            raise DatabaseError(f"The database couldn't be reached: {error}") from error
        if response.status_code != 200:
            raise DatabaseError(f"The database answered {response.status_code}.")
        for result in response.json()["results"][:-1]:
            if result.get("type") != "ok":
                raise DatabaseError(f"The database refused a write: {result.get('error', {}).get('message', 'unknown error')}")


def from_environment() -> Database:
    """The database MarketLab is using, from the same variables as the Next.js server."""
    url = os.environ.get("DATABASE_URL") or ""
    if url.startswith(("libsql://", "https://")):
        return TursoDatabase(url, os.environ.get("DATABASE_AUTH_TOKEN"))
    path = url.removeprefix("file:") if url.startswith("file:") else "local.db"
    return SqliteDatabase(path if os.path.isabs(path) else REPO_ROOT / path)


# --- Saved runs --------------------------------------------------------------


def load_saved_run(db: Database, owner_id: str, run_id: str) -> dict[str, Any] | None:
    """One of the owner's saved runs with its stored result and snapshot (JSON text), or None (missing, or someone else's)."""
    rows = db.query(
        "SELECT r.id, r.name, r.config, r.result, r.engine, r.engine_version, p.data AS snapshot "
        "FROM backtest_run r LEFT JOIN price_snapshot p ON p.checksum = r.snapshot_checksum "
        "WHERE r.id = ? AND r.user_id = ?",
        [run_id, owner_id],
    )
    return rows[0] if rows else None


def save_run(
    db: Database,
    owner_id: str,
    *,
    run_id: str,
    name: str,
    created_at: int,
    config_json: str,
    summary_json: str,
    result_json: str,
    snapshot_json: str,
    checksum: str,
    source: str,
    simulated: bool,
    as_of: int,
    engine: str,
    engine_version: str,
    dataset_version: str,
) -> bool:
    """
    Saves a run with its result and its snapshot. The snapshot is stored
    once per checksum. Returns False (saving nothing) if the owner doesn't
    exist or already has MAX_SAVED_RUNS runs.
    """
    db.execute(
        "INSERT INTO price_snapshot (checksum, data, source, simulated, as_of, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(checksum) DO NOTHING",
        [checksum, snapshot_json, source, 1 if simulated else 0, as_of, created_at],
    )
    inserted = db.execute(
        "INSERT INTO backtest_run (id, user_id, name, config, summary, created_at, result, snapshot_checksum, engine, engine_version, data_source, simulated, dataset_version) "
        "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? "
        "WHERE EXISTS (SELECT 1 FROM user WHERE id = ?) AND (SELECT count(*) FROM backtest_run WHERE user_id = ?) < ?",
        [run_id, owner_id, name, config_json, summary_json, created_at, result_json, checksum, engine, engine_version, source, 1 if simulated else 0, dataset_version, owner_id, owner_id, MAX_SAVED_RUNS],
    )
    return inserted == 1
