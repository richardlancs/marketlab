import { describe, expect, it } from "vitest";
import { CONFIG_VERSION, parseConfig, parseSavedRun } from "./config";
import { describeRuleSet, indicatorSeries, indicatorSeriesFromBars, parseRuleSet, RULE_PRESETS, type RuleSet } from "./rules";

describe("indicators", () => {
  it("computes simple and exponential averages, NaN while warming up", () => {
    expect(indicatorSeries({ kind: "sma", days: 3 }, [1, 2, 3, 4, 5])).toEqual([NaN, NaN, 2, 3, 4]);
    const ema = indicatorSeries({ kind: "ema", days: 3 }, [1, 2, 3, 4, 5]);
    // Starts at the 3-day average (2), then moves halfway (alpha = 2 / 4) toward each close.
    expect(ema.slice(2)).toEqual([2, 3, 4]);
    expect(indicatorSeries({ kind: "ema", days: 3 }, [3, 3, 3, 9]).at(-1)).toBe(6);
  });

  it("computes RSI: 100 when only rising, 0 when only falling, 50 when flat", () => {
    expect(indicatorSeries({ kind: "rsi", days: 3 }, [1, 2, 3, 4]).at(-1)).toBe(100);
    expect(indicatorSeries({ kind: "rsi", days: 3 }, [4, 3, 2, 1]).at(-1)).toBe(0);
    expect(indicatorSeries({ kind: "rsi", days: 3 }, [5, 5, 5, 5]).at(-1)).toBe(50);
    // Gains 2 and 1, loss 1 over 3 changes: RS = 3 / 1, RSI = 75.
    expect(indicatorSeries({ kind: "rsi", days: 3 }, [10, 12, 11, 12])).toEqual([NaN, NaN, NaN, 75]);
  });
});

describe("parseRuleSet", () => {
  const rsiBelow30 = { left: { kind: "rsi", days: 14 }, op: "below", right: { kind: "value", value: 30 } };

  it("accepts valid rules and drops unknown fields", () => {
    expect(parseRuleSet({ combine: "all", conditions: [{ ...rsiBelow30, extra: 1 }], extra: 2 })).toEqual({ combine: "all", conditions: [rsiBelow30] });
  });

  it.each([
    ["an unknown indicator", { ...rsiBelow30, left: { kind: "macd", days: 9 } }],
    ["an unknown operator", { ...rsiBelow30, op: "near" }],
    ["RSI compared with an average", { ...rsiBelow30, right: { kind: "sma", days: 50 } }],
    ["a constant outside 0 to 100", { ...rsiBelow30, right: { kind: "value", value: 200 } }],
    ["fractional days", { ...rsiBelow30, left: { kind: "rsi", days: 14.5 } }],
    ["a constant on the left", { left: { kind: "value", value: 30 }, op: "below", right: { kind: "rsi", days: 14 } }],
    ["an average longer than allowed", { left: { kind: "price" }, op: "above", right: { kind: "sma", days: 251 } }],
  ])("rejects %s", (_, condition) => {
    expect(parseRuleSet({ combine: "all", conditions: [condition] })).toBeNull();
  });

  it("needs 1 to 4 conditions and a way to combine them", () => {
    expect(parseRuleSet({ combine: "all", conditions: [] })).toBeNull();
    expect(parseRuleSet({ combine: "all", conditions: Array(5).fill(rsiBelow30) })).toBeNull();
    expect(parseRuleSet({ combine: "most", conditions: [rsiBelow30] })).toBeNull();
  });

  it("describes rules in words", () => {
    expect(describeRuleSet(RULE_PRESETS[0].entry)).toBe("RSI(14) is below 30");
    const both: RuleSet = { combine: "any", conditions: [RULE_PRESETS[0].entry.conditions[0], RULE_PRESETS[1].entry.conditions[0]] };
    expect(describeRuleSet(both)).toBe("RSI(14) is below 30 or price is above 200-day average");
  });
});

describe("config versions", () => {
  // Exactly as Phase 4 saved them: no `version` field.
  const v1Config = {
    holdings: [{ symbol: "AAPL", weight: 1 }],
    strategy: { kind: "moving-average", fast: 5, slow: 20 },
    start: 0,
    end: Number.MAX_SAFE_INTEGER,
    initialCash: 10_000,
    costs: { commission: 1, slippageBps: 5 },
    benchmark: "market",
  };
  const isKnown = (s: string) => s === "AAPL";

  it("reads a saved Phase 4 run, upgraded to the current version and otherwise unchanged", () => {
    const run = parseSavedRun({ id: "r", name: "Old run", createdAt: 1, config: v1Config, summary: { finalValue: 1, totalReturn: 0, cagr: 0, maxDrawdown: 0, benchmarkTotalReturn: 0 } }, isKnown);
    expect(run?.config).toEqual({ ...v1Config, version: CONFIG_VERSION });
  });

  it("round-trips a rules config through JSON", () => {
    const preset = RULE_PRESETS[0];
    const config = { ...v1Config, version: CONFIG_VERSION, strategy: { kind: "rules", entry: preset.entry, exit: preset.exit } };
    const parsed = parseConfig(JSON.parse(JSON.stringify(config)), isKnown);
    expect(parsed).toEqual(config);
  });
});

describe("rules on daily highs, lows and volume", () => {
  it("computes the chandelier stop: the highest high minus a multiple of Wilder's ATR", () => {
    // Three days; ATR(2): TRs 2 (first day: high − low), then max(3, |13 − 10|, |10 − 10|) = 3 → (2 + 3) / 2 = 2.5,
    // then max(2, |12 − 11|, |10 − 11|) = 2 → (2.5 × 1 + 2) / 2 = 2.25.
    const bars = [
      { close: 10, high: 11, low: 9, volume: 100 },
      { close: 11, high: 13, low: 10, volume: 200 },
      { close: 11, high: 12, low: 10, volume: 300 },
    ];
    const values = indicatorSeriesFromBars({ kind: "chandelier", days: 2, multiple: 2 }, bars);
    expect(values[0]).toBeNaN();
    expect(values[1]).toBeCloseTo(13 - 2 * 2.5);
    expect(values[2]).toBeCloseTo(13 - 2 * 2.25);
    expect(indicatorSeriesFromBars({ kind: "volume-average", days: 2 }, bars).slice(1)).toEqual([150, 250]);
  });

  it("keeps units apart: volume compares only with volume", () => {
    const rule = (left: object, right: object) => parseRuleSet({ combine: "all", conditions: [{ left, op: "above", right }] });
    expect(rule({ kind: "volume" }, { kind: "volume-average", days: 20 })).not.toBeNull();
    expect(rule({ kind: "volume" }, { kind: "sma", days: 20 })).toBeNull();
    expect(rule({ kind: "price" }, { kind: "chandelier", days: 22, multiple: 3 })).not.toBeNull();
    expect(rule({ kind: "price" }, { kind: "chandelier", days: 22, multiple: 50 })).toBeNull();
  });

});
