import { describe, expect, it } from "vitest";
import { parseMLResult, parseMLSettings } from "./types";

const YEAR = 365.25 * 86_400_000;
const END = Date.UTC(2026, 9, 23, 20);
const isKnown = (s: string) => ["AAPL", "MSFT", "KO", "JPM", "NVDA", "XOM"].includes(s);
const valid = { symbols: ["AAPL", "KO"], features: ["rsi", "gap50"], model: "logistic", start: END - 5 * YEAR, end: END };

describe("machine-learning settings", () => {
  it("are filled in with defaults and de-duplicated", () => {
    expect(parseMLSettings({ ...valid, symbols: ["AAPL", "AAPL", "KO"] }, isKnown)).toEqual({ version: 1, ...valid, trainYears: 2, testMonths: 3, costBps: 10, seed: 7 });
  });

  it.each([
    ["an unknown stock", { symbols: ["ZZZ"] }],
    ["too many stocks", { symbols: ["AAPL", "MSFT", "KO", "JPM", "NVDA", "XOM"] }],
    ["no features", { features: [] }],
    ["an unknown feature", { features: ["horoscope"] }],
    ["an unknown model", { model: "deep-learning" }],
    ["too short a period", { start: END - 2 * YEAR }],
    ["too long a period", { start: END - 11 * YEAR }],
    ["a training window as long as the period", { start: END - 3 * YEAR, trainYears: 3 }],
    ["silly costs", { costBps: 500 }],
  ])("refuse %s", (_, change) => {
    expect(parseMLSettings({ ...valid, ...change }, isKnown)).toBeNull();
  });

  it("results are checked before they're shown", () => {
    expect(parseMLResult({ version: "1.0.0", model: "logistic" })).toBeNull();
    expect(parseMLResult(null)).toBeNull();
  });
});
