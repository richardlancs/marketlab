import { describe, expect, it } from "vitest";
import { parsePairScan, parsePairSettings, parsePairTest, scanSummary, type PairScan } from "./types";

const known = (s: string) => ["AAPL", "MSFT"].includes(s);
const settings = { a: "AAPL", b: "MSFT", formationEnd: 1_700_000_000_000, entry: 2, exit: 0, stop: 4, initialCash: 10_000, costs: { commission: 0, slippageBps: 5 }, borrowBps: 50 };

describe("pair settings", () => {
  it("accept sensible levels and known, different stocks", () => {
    expect(parsePairSettings({ ...settings, extra: 1 }, known)).toEqual(settings);
  });

  it.each([
    ["the same stock twice", { ...settings, b: "AAPL" }],
    ["an unknown stock", { ...settings, b: "ZZZ" }],
    ["exit at or past entry", { ...settings, exit: 2 }],
    ["stop inside entry", { ...settings, stop: 1.5 }],
    ["a huge borrow fee", { ...settings, borrowBps: 5000 }],
    ["a fractional date", { ...settings, formationEnd: 1.5 }],
  ])("refuse %s", (_, value) => {
    expect(parsePairSettings(value, known)).toBeNull();
  });
});

const scan: PairScan = {
  formationStart: 1,
  formationEnd: 2,
  tests: 400,
  passed: 23,
  passedAdjusted: 0,
  expectedByChance: 20,
  pairs: [{ a: "AAPL", b: "MSFT", sector: "Technology", pValue: 0.01, adjusted: 0.6, hedgeRatio: 0.9, intercept: 0.1, halfLife: 12, correlation: 0.7, sessions: 252 }],
};

describe("scan results", () => {
  it("are checked and summed up in words", () => {
    expect(parsePairScan(scan)).toEqual(scan);
    expect(parsePairScan({ ...scan, pairs: [{ ...scan.pairs[0], pValue: "low" }] })).toBeNull();
    expect(scanSummary(scan)).toBe("400 same-sector pairs tested; 23 passed at 5%. By chance alone, about 20 would pass at 5%. None survive adjusting for how many were tested.");
    expect(scanSummary({ ...scan, passedAdjusted: 1 })).toContain("1 survives adjusting");
  });
});

describe("a pair's test", () => {
  const metrics = { finalValue: 10_100, totalReturn: 0.01, cagr: 0.01, maxDrawdown: 0.02, drawdownPeak: null, drawdownTrough: null, volatility: 0.05, sharpe: 0.2, trades: 4, exposure: 0.3 };
  const test = {
    a: "AAPL",
    b: "MSFT",
    formation: { start: 1, end: 2, sessions: 252, hedgeRatio: 1, intercept: 0, mean: 0, sd: 0.05, halfLife: 10, pValue: 0.02 },
    trading: { pValue: 0.3 },
    settings: { entry: 2, exit: 0, stop: 4, initialCash: 10_000, commission: 0, slippageBps: 5, borrowBps: 50 },
    times: [3, 4],
    z: [0.5, -2.1],
    prices: { a: [100, 101], b: [50, 49] },
    equity: [
      { time: 3, price: 10_000 },
      { time: 4, price: 10_100 },
    ],
    trades: [{ time: 4, symbol: "AAPL", side: "buy", shares: 50, price: 101, reason: "gap stretched low" }],
    metrics,
    costs: { commission: 0, slippage: 1, borrow: 0.1 },
  };

  it("is checked, its series one value per day", () => {
    expect(parsePairTest(test)).toEqual(test);
    expect(parsePairTest({ ...test, z: [0.5] })).toBeNull();
    expect(parsePairTest({ ...test, trades: [{ ...test.trades[0], side: "short" }] })).toBeNull();
  });
});
