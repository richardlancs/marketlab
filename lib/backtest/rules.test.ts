import { describe, expect, it } from "vitest";
import { tradingDaysEndingAt } from "../market/calendar";
import { mulberry32 } from "../random";
import type { PricePoint } from "../types";
import { CONFIG_VERSION, parseConfig, parseSavedRun, runConfig, summarize, type BacktestConfig } from "./config";
import { NO_COSTS, runBacktest } from "./engine";
import { describeRuleSet, indicatorSeries, parseRuleSet, RULE_PRESETS, ruleStrategy, type RuleSet } from "./rules";
import { movingAverageCrossover } from "./strategies";

function series(prices: number[]): PricePoint[] {
  const days = tradingDaysEndingAt(Date.UTC(2026, 9, 16), prices.length);
  return prices.map((price, i) => ({ time: days[i] + 20 * 3600_000, price }));
}
/** A bumpy random walk, the same every run. */
function walk(length: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const out = [100];
  for (let i = 1; i < length; i++) out.push(out[i - 1] * (1 + (rng() - 0.5) * 0.06));
  return out;
}
const all = { start: 0, end: Number.MAX_SAFE_INTEGER, initialCash: 1000, costs: NO_COSTS };

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

describe("ruleStrategy", () => {
  it("'Golden cross' trades exactly like the moving-average crossover", () => {
    const golden = RULE_PRESETS.find((p) => p.name === "Golden cross")!;
    const points = [{ symbol: "A", points: series(walk(700, 7)) }, { symbol: "B", points: series(walk(700, 8)) }];
    const weights = { A: 0.5, B: 0.5 };
    const rules = runBacktest(points, ruleStrategy(weights, golden.entry, golden.exit), all);
    const classic = runBacktest(points, movingAverageCrossover(weights, 50, 200), all);
    expect(rules.trades.length).toBeGreaterThan(2);
    expect(rules.trades).toEqual(classic.trades);
    expect(rules.equity).toEqual(classic.equity);
  });

  it("doesn't trade while its indicators are warming up", () => {
    const preset = RULE_PRESETS.find((p) => p.name === "Price above 200-day average")!;
    const run = runBacktest([{ symbol: "A", points: series(walk(260, 3)) }], ruleStrategy({ A: 1 }, preset.entry, preset.exit), all);
    // The average needs 200 closes, which the strategy has on day 200 (it sees up to yesterday).
    expect(run.trades.every((t) => t.time >= run.equity[200].time)).toBe(true);
  });

  it("only acts on a cross, not on the level", () => {
    const crossUp: RuleSet = { combine: "all", conditions: [{ left: { kind: "price" }, op: "crosses-above", right: { kind: "sma", days: 2 } }] };
    // An exit that can never be true (a value above itself), so the one buy is the only trade.
    const hold: RuleSet = { combine: "all", conditions: [{ left: { kind: "sma", days: 2 }, op: "above", right: { kind: "sma", days: 2 } }] };
    // Falls, then rises across its 2-day average on day 3, then keeps rising.
    const run = runBacktest([{ symbol: "A", points: series([10, 9, 8, 10, 11, 12, 13]) }], ruleStrategy({ A: 1 }, crossUp, hold), all);
    expect(run.trades).toHaveLength(1);
    expect(run.trades[0].time).toBe(run.equity[4].time);
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

  it("reads a saved Phase 4 run, upgraded to the current version, with the same results", () => {
    const run = parseSavedRun({ id: "r", name: "Old run", createdAt: 1, config: v1Config, summary: { finalValue: 1, totalReturn: 0, cagr: 0, maxDrawdown: 0, benchmarkTotalReturn: 0 } }, isKnown);
    expect(run?.config).toEqual({ ...v1Config, version: CONFIG_VERSION });
    const history = { AAPL: series(walk(120, 5)) };
    const market = series(walk(120, 6));
    const before = summarize(runConfig(v1Config as unknown as BacktestConfig, history, market));
    expect(summarize(runConfig(run!.config, history, market))).toEqual(before);
  });

  it("round-trips a rules config through JSON", () => {
    const preset = RULE_PRESETS[0];
    const config = { ...v1Config, version: CONFIG_VERSION, strategy: { kind: "rules", entry: preset.entry, exit: preset.exit } };
    const parsed = parseConfig(JSON.parse(JSON.stringify(config)), isKnown);
    expect(parsed).toEqual(config);
  });
});
