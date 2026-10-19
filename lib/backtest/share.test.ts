import { describe, expect, it } from "vitest";
import { CONFIG_VERSION, type BacktestConfig } from "./config";
import { RULE_PRESETS } from "./rules";
import { parseShareFragment, shareFragment } from "./share";

const config: BacktestConfig = {
  version: CONFIG_VERSION,
  holdings: [
    { symbol: "AAPL", weight: 0.5 },
    { symbol: "BRK-B", weight: 0.5 },
  ],
  strategy: { kind: "rules", entry: RULE_PRESETS[0].entry, exit: RULE_PRESETS[0].exit },
  start: 1_700_000_000_000,
  end: 1_790_000_000_000,
  initialCash: 10_000,
  costs: { commission: 1, slippageBps: 5 },
  benchmark: "market",
};
const any = () => true;

describe("backtest share links", () => {
  it("round-trips settings through a URL-safe fragment", () => {
    const fragment = shareFragment(config);
    expect(fragment).toMatch(/^run=[A-Za-z0-9_-]+$/);
    expect(parseShareFragment(`#${fragment}`, any)).toEqual(config);
  });

  it("rejects anything that isn't valid settings", () => {
    expect(parseShareFragment("", any)).toBeNull();
    expect(parseShareFragment("#run=not+base64!", any)).toBeNull();
    expect(parseShareFragment(`#run=${btoa("{oops")}`, any)).toBeNull();
    expect(parseShareFragment(`#${shareFragment({ ...config, initialCash: 1e15 })}`, any)).toBeNull();
    expect(parseShareFragment(`#${shareFragment(config)}`, (s) => s === "AAPL")).toBeNull();
    expect(parseShareFragment(`#run=${"A".repeat(5000)}`, any)).toBeNull();
  });
});
