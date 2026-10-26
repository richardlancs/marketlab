import { describe, expect, it } from "vitest";
import { CONFIG_VERSION, type BacktestConfig } from "./config";
import { RULE_PRESETS } from "./rules";
import { axisValues, buildGrid, SWEEP_LIMITS, sweepableParams, withParam } from "./sweep";

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

});
