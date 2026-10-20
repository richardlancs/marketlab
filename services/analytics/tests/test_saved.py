"""Saving and reproducing runs through the database, on a throwaway SQLite file built from MarketLab's own migrations."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from analytics import api, db as database
from main import app

ROOT = Path(__file__).resolve().parents[3]
TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
DAY = 86_400_000
T0 = 1_700_000_000_000


@pytest.fixture
def store(tmp_path, monkeypatch):
    """A fresh database with every migration applied, and one user."""
    path = tmp_path / "test.db"
    sqlite = database.SqliteDatabase(path)
    for migration in sorted((ROOT / "drizzle").glob("*.sql")):
        for statement in migration.read_text().split("--> statement-breakpoint"):
            if statement.strip():
                sqlite.execute(statement)
    sqlite.execute("INSERT INTO user (id, name, email) VALUES ('owner-1', 'A', 'a@example.com'), ('owner-2', 'B', 'b@example.com')")
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    app.dependency_overrides[api.get_database] = lambda: sqlite
    yield sqlite
    app.dependency_overrides.clear()


client = TestClient(app)


def save_body(run_id="run-1", owner="owner-1", checksum="a" * 64):
    times = [T0 + i * DAY for i in range(60)]
    prices = [100 + i + (i % 4) for i in range(60)]
    return {
        "ownerId": owner,
        "run": {"id": run_id, "name": "AAPL 5/20", "createdAt": 1},
        "config": {
            "version": 2,
            "holdings": [{"symbol": "AAPL", "weight": 1}],
            "strategy": {"kind": "moving-average", "fast": 5, "slow": 20},
            "start": times[0],
            "end": times[-1],
            "initialCash": 10_000,
            "costs": {"commission": 1, "slippageBps": 5},
            "benchmark": "same-stocks",
        },
        "snapshot": {
            "version": 1,
            "source": "mock",
            "simulated": True,
            "asOf": times[-1],
            "adjustment": "split-and-dividend-adjusted-closes",
            "series": {"AAPL": {"times": times, "prices": prices}},
            "market": None,
        },
        "dataset": {"checksum": checksum, "datasetVersion": f"mock:{checksum[:12]}", "source": "mock", "simulated": True, "asOf": times[-1], "firstDate": times[0], "lastDate": times[-1], "observations": 60},
        "note": None,
        "assumptions": {"signals": "Decisions use closes up to the previous trading day only."},
    }


def test_saves_its_own_result_with_the_snapshot(store):
    response = client.post("/v1/saved-runs", json=save_body(), headers=AUTH)
    assert response.status_code == 200, response.text
    [row] = store.query("SELECT * FROM backtest_run")
    assert (row["user_id"], row["engine"], row["engine_version"], row["data_source"], row["simulated"]) == ("owner-1", "python", "1.0.0", "mock", 1)
    result = json.loads(row["result"])
    assert result["provenance"]["engine"] == {"name": "python", "version": "1.0.0"}
    assert len(result["outcome"]["run"]["equity"]) == 60
    assert json.loads(row["summary"])["finalValue"] == result["outcome"]["run"]["metrics"]["finalValue"]
    [snap] = store.query("SELECT * FROM price_snapshot")
    assert json.loads(snap["data"])["series"]["AAPL"]["prices"][0] == 100


def test_stores_each_snapshot_once(store):
    client.post("/v1/saved-runs", json=save_body("run-1"), headers=AUTH)
    client.post("/v1/saved-runs", json=save_body("run-2"), headers=AUTH)
    assert store.query("SELECT count(*) AS n FROM price_snapshot")[0]["n"] == 1
    assert store.query("SELECT count(*) AS n FROM backtest_run")[0]["n"] == 2


def test_refuses_an_unknown_owner_and_a_full_list(store):
    assert client.post("/v1/saved-runs", json=save_body(owner="nobody"), headers=AUTH).status_code == 404
    for i in range(database.MAX_SAVED_RUNS):
        assert client.post("/v1/saved-runs", json=save_body(f"run-{i}"), headers=AUTH).status_code == 200
    response = client.post("/v1/saved-runs", json=save_body("one-too-many"), headers=AUTH)
    assert response.status_code == 409 and "up to 50" in response.json()["error"]


def test_needs_the_service_token(store):
    assert client.post("/v1/saved-runs", json=save_body()).status_code == 401
    assert client.post("/v1/saved-runs/run-1/reproduce", json={"ownerId": "owner-1"}).status_code == 401


def test_reproduces_a_saved_run_from_the_database(store):
    client.post("/v1/saved-runs", json=save_body(), headers=AUTH)
    response = client.post("/v1/saved-runs/run-1/reproduce", json={"ownerId": "owner-1"}, headers=AUTH)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["comparison"] == {"matches": True, "largestDifference": 0.0, "differences": []}
    assert body["reproduced"]["provenance"]["dataset"]["checksum"] == "a" * 64


def test_notices_a_stored_result_that_doesnt_follow_from_its_inputs(store):
    client.post("/v1/saved-runs", json=save_body(), headers=AUTH)
    [row] = store.query("SELECT result FROM backtest_run")
    tampered = json.loads(row["result"])
    tampered["outcome"]["run"]["metrics"]["finalValue"] += 500
    store.execute("UPDATE backtest_run SET result = ?", [json.dumps(tampered)])
    comparison = client.post("/v1/saved-runs/run-1/reproduce", json={"ownerId": "owner-1"}, headers=AUTH).json()["comparison"]
    assert comparison["matches"] is False and "finalValue" in comparison["differences"][0]


def test_only_the_owner_can_reproduce(store):
    client.post("/v1/saved-runs", json=save_body(), headers=AUTH)
    assert client.post("/v1/saved-runs/run-1/reproduce", json={"ownerId": "owner-2"}, headers=AUTH).status_code == 404


def test_explains_runs_it_cant_reproduce(store):
    store.execute("INSERT INTO backtest_run (id, user_id, name, config, summary, created_at) VALUES ('old', 'owner-1', 'Old', '{}', '{}', 1)")
    response = client.post("/v1/saved-runs/old/reproduce", json={"ownerId": "owner-1"}, headers=AUTH)
    assert response.status_code == 409 and "before MarketLab kept results" in response.json()["error"]
    client.post("/v1/saved-runs", json=save_body("ts-run"), headers=AUTH)
    store.execute("UPDATE backtest_run SET engine = 'typescript' WHERE id = 'ts-run'")
    response = client.post("/v1/saved-runs/ts-run/reproduce", json={"ownerId": "owner-1"}, headers=AUTH)
    assert response.status_code == 409 and "typescript" in response.json()["error"]


class TestTursoClient:
    def test_sends_typed_arguments_and_reads_typed_rows(self):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["auth"] = request.headers["authorization"]
            seen["body"] = json.loads(request.content)
            return httpx.Response(200, json={"results": [{"type": "ok", "response": {"type": "execute", "result": {"cols": [{"name": "n"}, {"name": "s"}, {"name": "x"}], "rows": [[{"type": "integer", "value": "12345678901234"}, {"type": "text", "value": "hi"}, {"type": "null"}]], "affected_row_count": 0}}}, {"type": "ok", "response": {"type": "close"}}]})

        turso = database.TursoDatabase("libsql://db-org.turso.io", "secret", client=httpx.Client(transport=httpx.MockTransport(handler)))
        rows = turso.query("SELECT ?, ?, ?, ?", [7, 1.5, "a", None])
        assert seen["url"] == "https://db-org.turso.io/v2/pipeline" and seen["auth"] == "Bearer secret"
        assert seen["body"]["requests"][0]["stmt"]["args"] == [{"type": "integer", "value": "7"}, {"type": "float", "value": 1.5}, {"type": "text", "value": "a"}, {"type": "null"}]
        assert rows == [{"n": 12345678901234, "s": "hi", "x": None}]

    def test_reports_errors(self):
        refused = lambda _r: httpx.Response(200, json={"results": [{"type": "error", "error": {"message": "no such table"}}]})
        turso = database.TursoDatabase("libsql://db.turso.io", "t", client=httpx.Client(transport=httpx.MockTransport(refused)))
        with pytest.raises(database.DatabaseError, match="no such table"):
            turso.execute("DELETE FROM nope")
        down = lambda _r: httpx.Response(502)
        turso = database.TursoDatabase("libsql://db.turso.io", "t", client=httpx.Client(transport=httpx.MockTransport(down)))
        with pytest.raises(database.DatabaseError, match="502"):
            turso.query("SELECT 1")

    def test_database_errors_become_a_clear_503(self, monkeypatch):
        class Broken:
            def query(self, *a, **k):
                raise database.DatabaseError("down")

            execute = query

        monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
        app.dependency_overrides[api.get_database] = lambda: Broken()
        try:
            response = TestClient(app, raise_server_exceptions=False).post("/v1/saved-runs/x/reproduce", json={"ownerId": "o"}, headers=AUTH)
            assert response.status_code == 503 and "database" in response.json()["error"]
        finally:
            app.dependency_overrides.clear()
