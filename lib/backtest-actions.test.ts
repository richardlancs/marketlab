// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_VERSION, type BacktestConfig } from "./backtest/config";

// The server-side run, the rate limit and storage are replaced with test doubles.
const server = vi.hoisted(() => ({ runOnServer: vi.fn(), sweepOnServer: vi.fn(), runFull: vi.fn() }));
const db = vi.hoisted(() => ({ backtests: { get: vi.fn(), save: vi.fn() } }));
const owner = vi.hoisted(() => ({ current: { id: "user-1", kind: "user", pendingGuest: null } as { id: string; kind: string; pendingGuest: null } | null }));
const limits = vi.hoisted(() => ({ allowed: true, calls: [] as string[] }));
vi.mock("./backtest/server", () => server);
vi.mock("./rate-limit", () => ({
  allow: async (name: string) => {
    limits.calls.push(name);
    return limits.allowed;
  },
}));
vi.mock("./db", () => db);
const python = vi.hoisted(() => {
  class PythonEngineError extends Error {}
  return { PythonEngineError, savePythonRun: vi.fn(), reproducePythonRun: vi.fn(), analyseOnPython: vi.fn(async () => ({ analysis: {}, periods: {} })) };
});
vi.mock("./backtest/python-client", () => python);
vi.mock("./owner", () => ({ currentOwner: async () => owner.current }));
const analytics = vi.hoisted(() => ({ walkForwardOnServer: vi.fn() }));
vi.mock("./analytics/server", () => analytics);

const { compareRunsAction, loadSavedRunAction, reproduceSavedRunAction, runBacktestAction, runSweepAction, saveBacktestAction, walkForwardAction } = await import("./backtest-actions");

const config: BacktestConfig = {
  version: CONFIG_VERSION,
  holdings: [{ symbol: "AAPL", weight: 1 }],
  strategy: { kind: "moving-average", fast: 20, slow: 50 },
  start: 1,
  end: 2,
  initialCash: 10_000,
  costs: { commission: 0, slippageBps: 0 },
  benchmark: "same-stocks",
};

beforeEach(() => {
  vi.clearAllMocks();
  owner.current = { id: "user-1", kind: "user", pendingGuest: null };
  limits.allowed = true;
  limits.calls = [];
  server.runOnServer.mockResolvedValue({ ok: true, outcome: {}, note: null });
  server.sweepOnServer.mockResolvedValue({ ok: true, result: {} });
});

describe("running backtests on the server", () => {
  it("validates the settings before running anything", async () => {
    expect(await runBacktestAction({ ...config, initialCash: -5 })).toMatchObject({ ok: false });
    expect(await runBacktestAction("everything")).toMatchObject({ ok: false });
    expect(server.runOnServer).not.toHaveBeenCalled();
    expect(await runBacktestAction(config)).toMatchObject({ ok: true });
    expect(server.runOnServer).toHaveBeenCalledWith(config);
  });

  it("refuses when a visitor is over the limit", async () => {
    limits.allowed = false;
    expect(await runBacktestAction(config)).toMatchObject({ ok: false, message: expect.stringContaining("Wait a minute") });
    expect(server.runOnServer).not.toHaveBeenCalled();
  });

  it("compares 2 to 4 valid runs", async () => {
    expect(await compareRunsAction([config])).toMatchObject({ ok: false });
    expect(await compareRunsAction([config, config, config, config, config])).toMatchObject({ ok: false });
    expect(await compareRunsAction([config, { nope: 1 }])).toMatchObject({ ok: false });
    expect(await compareRunsAction([config, config])).toHaveLength(2);
  });

  it("checks a sweep's axes and has its own, tighter limit", async () => {
    expect(await runSweepAction(config, [])).toMatchObject({ ok: false });
    expect(await runSweepAction(config, [{ param: "fast", from: 5, to: "lots", step: 5 }])).toMatchObject({ ok: false });
    expect(await runSweepAction(config, [{ param: "fast", from: 5, to: 40, step: 5, extra: "dropped" }])).toMatchObject({ ok: true });
    expect(server.sweepOnServer).toHaveBeenCalledWith(config, [{ param: "fast", from: 5, to: 40, step: 5 }]);
    expect(limits.calls).toContain("sweep");
  });
});

describe("saved results", () => {
  const savedRun = { id: "run-1", name: "AAPL", createdAt: 1, config, summary: {} };
  const stored = {
    result: { outcome: { run: { equity: [], trades: [], metrics: {} }, benchmark: { equity: [], trades: [], metrics: {} } }, note: null, provenance: { engine: { name: "python", version: "1.0.0" } } },
    snapshot: { version: 1 },
  };

  it("open only the owner's runs", async () => {
    db.backtests.get.mockResolvedValue(null);
    expect(await loadSavedRunAction("run-1")).toMatchObject({ ok: false });
    expect(db.backtests.get).toHaveBeenCalledWith("user-1", "run-1");
    owner.current = null;
    expect(await loadSavedRunAction("run-1")).toMatchObject({ ok: false });
  });

  it("show the stored result, not a new run", async () => {
    db.backtests.get.mockResolvedValue({ run: savedRun, stored });
    // Saved before the measures came with results: they're worked out on opening.
    expect(await loadSavedRunAction("run-1")).toEqual({ ok: true, run: savedRun, stored: { ...stored.result, extras: { analysis: {}, periods: {} } } });
    expect(python.analyseOnPython).toHaveBeenCalledWith(stored.result.outcome, config.costs);
    expect(server.runFull).not.toHaveBeenCalled();
  });

  it("explain that an older run can't be reproduced", async () => {
    db.backtests.get.mockResolvedValue({ run: savedRun, stored: null });
    expect(await reproduceSavedRunAction("run-1")).toMatchObject({ ok: false, message: expect.stringContaining("Re-run it with current prices") });
  });

  it("have the Python service reproduce a run saved by the retired TypeScript engine", async () => {
    const tsStored = { ...stored, result: { ...stored.result, provenance: { engine: { name: "typescript", version: "1.2.0" } } } };
    db.backtests.get.mockResolvedValue({ run: savedRun, stored: tsStored });
    python.reproducePythonRun.mockResolvedValue({ reproduced: stored.result, comparison: { matches: true, largestDifference: 0, differences: [] } });
    expect(await reproduceSavedRunAction("run-1")).toMatchObject({ ok: true, comparison: { matches: true } });
    expect(python.reproducePythonRun).toHaveBeenCalledWith("run-1", "user-1");
  });

  it("have the Python service reproduce a Python run, from the database, for the verified owner", async () => {
    db.backtests.get.mockResolvedValue({ run: savedRun, stored });
    python.reproducePythonRun.mockResolvedValue({ reproduced: stored.result, comparison: { matches: true, largestDifference: 0, differences: [] } });
    expect(await reproduceSavedRunAction("run-1")).toMatchObject({ ok: true, comparison: { matches: true } });
    expect(python.reproducePythonRun).toHaveBeenCalledWith("run-1", "user-1");
    python.reproducePythonRun.mockRejectedValue(new python.PythonEngineError("The database couldn't be reached. Try again in a minute."));
    expect(await reproduceSavedRunAction("run-1")).toEqual({ ok: false, message: "The database couldn't be reached. Try again in a minute." });
  });

  it("have the Python service save a Python run, for the verified owner, and never fall back", async () => {
    server.runFull.mockResolvedValue({ ok: true, ...stored.result, provenance: { ...stored.result.provenance, assumptions: {}, dataset: { source: "mock", simulated: true, datasetVersion: "mock:1" } }, snapshot: { version: 1, series: {} } });
    python.savePythonRun.mockResolvedValue({ summary: { finalValue: 1, totalReturn: 0, cagr: 0, maxDrawdown: 0, benchmarkTotalReturn: 0 }, result: stored.result });
    expect(await saveBacktestAction("Mine", config)).toMatchObject({ ok: true, run: { name: "Mine", summary: { finalValue: 1 } } });
    expect(python.savePythonRun.mock.calls[0][0]).toMatchObject({ ownerId: "user-1", config, snapshot: { version: 1, series: {} } });
    expect(db.backtests.save).not.toHaveBeenCalled();
    python.savePythonRun.mockRejectedValue(new python.PythonEngineError("You can save up to 50 runs. Delete one to make room."));
    expect(await saveBacktestAction("Mine", config)).toEqual({ ok: false, message: "You can save up to 50 runs. Delete one to make room." });
    expect(db.backtests.save).not.toHaveBeenCalled();
  });

});

describe("walk-forward tests", () => {
  const range = { from: 10, to: 50, step: 10 };
  it("check the settings before asking the analytics service, and count against the sweep limit", async () => {
    analytics.walkForwardOnServer.mockResolvedValue({ ok: true, result: {} });
    limits.calls.length = 0;
    expect(await walkForwardAction(config, range, { from: 100, to: 200, step: 50 }, 2, 6)).toEqual({ ok: true, result: {} });
    expect(analytics.walkForwardOnServer).toHaveBeenCalledWith(config, range, { from: 100, to: 200, step: 50 }, 2, 6);
    expect(limits.calls).toEqual(["sweep"]);
    analytics.walkForwardOnServer.mockClear();
    expect((await walkForwardAction({ ...config, strategy: { kind: "buy-and-hold" } }, range, range, 2, 6)).ok).toBe(false);
    expect((await walkForwardAction(config, { from: 0, to: 5, step: 1 }, range, 2, 6)).ok).toBe(false);
    expect((await walkForwardAction(config, range, range, 7, 6)).ok).toBe(false);
    expect(analytics.walkForwardOnServer).not.toHaveBeenCalled();
  });
});
