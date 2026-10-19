import { describe, expect, it } from "vitest";
import { tradingDaysEndingAt } from "../market/calendar";
import { mulberry32 } from "../random";
import type { PricePoint } from "../types";
import { CONFIG_VERSION, runConfig, type BacktestConfig } from "./config";
import { RULE_PRESETS } from "./rules";
import { axisValues, buildGrid, runSweep, SWEEP_LIMITS, sweepableParams, withParam } from "./sweep";

function walk(length: number, seed: number): PricePoint[] {
  const rng = mulberry32(seed);
  const days = tradingDaysEndingAt(Date.UTC(2026, 9, 16), length);
  let price = 100;
  return days.map((d) => ({ time: d + 20 * 3600_000, price: (price *= 1 + (rng() - 0.5) * 0.05) }));
}
const history = { A: walk(400, 1) };
const market = walk(400, 2);
const base: BacktestConfig = {
  version: CONFIG_VERSION,
  holdings: [{ symbol: "A", weight: 1 }],
  strategy: { kind: "moving-average", fast: 10, slow: 50 },
  start: 0,
  end: Number.MAX_SAFE_INTEGER,
  initialCash: 10_000,
  costs: { commission: 0, slippageBps: 0 },
  benchmark: "market",
};

describe("sweeps", () => {
  it("lists the settings each strategy can vary", () => {
    expect(sweepableParams(base).map((p) => p.id)).toEqual(["fast", "slow"]);
    const rules = { ...base, strategy: { kind: "rules" as const, entry: RULE_PRESETS[0].entry, exit: RULE_PRESETS[0].exit } };
    expect(sweepableParams(rules).map((p) => p.id)).toEqual(["entry.0.left", "entry.0.right", "exit.0.left", "exit.0.right"]);
    expect(sweepableParams({ ...base, strategy: { kind: "buy-and-hold" } })).toEqual([]);
  });

  it("changes one setting at a time, and rejects invalid combinations", () => {
    expect(withParam(base, "slow", 100)?.strategy).toEqual({ kind: "moving-average", fast: 10, slow: 100 });
    expect(withParam(base, "fast", 60)).toBeNull(); // no longer shorter than the long average
    const rules = { ...base, strategy: { kind: "rules" as const, entry: RULE_PRESETS[0].entry, exit: RULE_PRESETS[0].exit } };
    const changed = withParam(rules, "entry.0.right", 25);
    expect(changed?.strategy.kind === "rules" && changed.strategy.entry.conditions[0].right).toEqual({ kind: "value", value: 25 });
    expect(withParam(rules, "entry.3.left", 5)).toBeNull();
    // The base config isn't changed.
    expect(rules.strategy.entry.conditions[0].right).toEqual({ kind: "value", value: 30 });
  });

  it("builds axes and refuses grids that are too big", () => {
    expect(axisValues({ param: "fast", from: 10, to: 30, step: 10 })).toEqual([10, 20, 30]);
    expect(axisValues({ param: "fast", from: 1, to: 100, step: 1 })).toBeNull();
    expect(axisValues({ param: "fast", from: 5, to: 1, step: 1 })).toBeNull();
    const tooMany = buildGrid(base, [
      { param: "fast", from: 2, to: 30, step: 2 },
      { param: "slow", from: 50, to: 190, step: 10 },
    ]);
    expect(tooMany).toMatchObject({ error: expect.stringContaining(String(SWEEP_LIMITS.maxRuns)) });
  });

  it("gives the same metrics as running each setting on its own, with invalid points left empty", () => {
    const axes = [
      { param: "fast", from: 10, to: 60, step: 25 },
      { param: "slow", from: 40, to: 80, step: 40 },
    ];
    const result = runSweep(base, axes, history, market);
    if ("error" in result) throw new Error(result.error);
    expect(result.points.map((p) => p.values)).toEqual([[10, 40], [10, 80], [35, 40], [35, 80], [60, 40], [60, 80]]);
    for (const point of result.points) {
      const [fast, slow] = point.values;
      if (fast >= slow) expect(point.metrics).toBeNull();
      else expect(point.metrics).toEqual(runConfig({ ...base, strategy: { kind: "moving-average", fast, slow } }, history, market).run.metrics);
    }
    expect(result.benchmark).toEqual(runConfig(base, history, market).benchmark.metrics);
  });

  it("reports progress", () => {
    const calls: number[] = [];
    runSweep(base, [{ param: "slow", from: 20, to: 140, step: 10 }], history, market, (done) => calls.push(done), 5);
    expect(calls).toEqual([5, 10, 13]);
  });
});
