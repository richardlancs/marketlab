import { describe, expect, it } from "vitest";
import { luckVerdict, parseLuck, type LuckComparison, type LuckResult } from "./luck";

const comparison = (beat: number, kind: LuckComparison["kind"] = "timing"): LuckComparison => ({
  kind,
  trials: 1000,
  strategy: { totalReturn: 0.3, sharpe: 0.8 },
  randomMedian: { totalReturn: 0.1, sharpe: 0.4 },
  percentile: { totalReturn: beat, sharpe: beat },
  histogram: { edges: [-0.2, 0, 0.2, 0.4], counts: [100, 600, 300] },
});

const result: LuckResult = {
  comparison: comparison(0.97),
  sharpeRange: { sharpe: 0.8, benchmarkSharpe: 0.5, low: 0.1, high: 1.4, chanceAboveBenchmark: 0.72, resamples: 2000, block: 21 },
  notes: [],
};

describe("the luck check's answer", () => {
  it("is checked field by field", () => {
    expect(parseLuck(result)).toEqual(result);
    expect(parseLuck({ ...result, comparison: null, notes: ["This strategy makes no choices to compare with random ones."] })).not.toBeNull();
    expect(parseLuck({ ...result, comparison: { ...result.comparison, kind: "guessing" } })).toBeNull();
    // One more edge than there are bars, always.
    expect(parseLuck({ ...result, comparison: { ...result.comparison, histogram: { edges: [0, 1], counts: [1, 2] } } })).toBeNull();
    expect(parseLuck({ ...result, sharpeRange: { ...result.sharpeRange, resamples: "many" } })).toBeNull();
    expect(parseLuck({ comparison: null, sharpeRange: null })).toBeNull();
  });
});

describe("the verdict", () => {
  it("says how often luck alone does as well, and what that means", () => {
    expect(luckVerdict(comparison(0.97))).toMatch(/^It beat 97% of 1,000 random timings that traded as often and stayed invested as long\. Luck alone rarely does that well \(3% of the time\)/);
    expect(luckVerdict(comparison(0.8))).toContain("suggestive, not convincing");
    expect(luckVerdict(comparison(0.5, "picking"))).toMatch(/random versions that spread the same weights.*no sign the choices added anything/);
    expect(luckVerdict(comparison(0.1))).toContain("Random choices did better most of the time.");
  });

  it("says so when there's nothing to compare", () => {
    expect(luckVerdict({ ...comparison(0.5), percentile: { totalReturn: null, sharpe: null } })).toBe("There wasn't enough to compare.");
  });
});
