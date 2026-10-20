// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_VERSION, type BacktestConfig } from "./backtest/config";

// The server-side run, the rate limit and storage are replaced with test doubles.
const server = vi.hoisted(() => ({ runOnServer: vi.fn(), sweepOnServer: vi.fn(), runFull: vi.fn(), runFromSnapshot: vi.fn() }));
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
vi.mock("./owner", () => ({ currentOwner: async () => owner.current }));

const { compareRunsAction, loadSavedRunAction, reproduceSavedRunAction, runBacktestAction, runSweepAction, saveBacktestAction } = await import("./backtest-actions");

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
    expect(await loadSavedRunAction("run-1")).toEqual({ ok: true, run: savedRun, stored: stored.result });
    expect(server.runFull).not.toHaveBeenCalled();
  });

  it("explain that an older run can't be reproduced", async () => {
    db.backtests.get.mockResolvedValue({ run: savedRun, stored: null });
    expect(await reproduceSavedRunAction("run-1")).toMatchObject({ ok: false, message: expect.stringContaining("Re-run it with current prices") });
  });

  it("reproduce with the stored engine, from the saved prices, not from the cache", async () => {
    db.backtests.get.mockResolvedValue({ run: savedRun, stored });
    server.runFromSnapshot.mockResolvedValue({ ok: true, ...stored.result });
    const result = await reproduceSavedRunAction("run-1");
    expect(server.runFromSnapshot).toHaveBeenCalledWith(config, stored.snapshot, "python", { fresh: true });
    expect(result).toMatchObject({ ok: true, comparison: { matches: true } });
  });

  it("save the server's own result with its prices", async () => {
    server.runFull.mockResolvedValue({ ok: true, ...stored.result, provenance: { ...stored.result.provenance, dataset: { source: "mock", simulated: true, datasetVersion: "mock:1" } }, snapshot: { version: 1, series: {} } });
    db.backtests.save.mockResolvedValue(true);
    await saveBacktestAction("Mine", config);
    const [, run, kept] = db.backtests.save.mock.calls[0];
    expect(run.stored).toEqual({ engine: { name: "python", version: "1.0.0" }, dataSource: "mock", simulated: true, datasetVersion: "mock:1" });
    expect(kept.snapshot).toEqual({ version: 1, series: {} });
    expect(kept.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

