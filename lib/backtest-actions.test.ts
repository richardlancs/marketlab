// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_VERSION, type BacktestConfig } from "./backtest/config";

// The server-side run, the rate limit and storage are replaced with test doubles.
const server = vi.hoisted(() => ({ runOnServer: vi.fn(), sweepOnServer: vi.fn() }));
const limits = vi.hoisted(() => ({ allowed: true, calls: [] as string[] }));
vi.mock("./backtest/server", () => server);
vi.mock("./rate-limit", () => ({
  allow: async (name: string) => {
    limits.calls.push(name);
    return limits.allowed;
  },
}));
vi.mock("./db", () => ({ backtests: {} }));
vi.mock("./owner", () => ({ currentOwner: async () => null }));

const { compareRunsAction, runBacktestAction, runSweepAction } = await import("./backtest-actions");

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
