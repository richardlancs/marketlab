import { describe, expect, it } from "vitest";
import { tradingDaysEndingAt } from "../market/calendar";
import type { PricePoint } from "../types";
import { parseConfig, type BacktestConfig } from "./config";
import { alignSeries, computeMetrics, NO_COSTS, runBacktest, type Strategy, type StrategyContext } from "./engine";
import { buyAndHold, movingAverageCrossover } from "./strategies";

/** Daily points on consecutive weekdays ending Oct 16, 2026. */
function series(prices: number[]): PricePoint[] {
  const days = tradingDaysEndingAt(Date.UTC(2026, 9, 16), prices.length);
  return prices.map((price, i) => ({ time: days[i] + 20 * 3600_000, price }));
}
const all = { start: 0, end: Number.MAX_SAFE_INTEGER, initialCash: 1000, costs: NO_COSTS };

describe("runBacktest", () => {
  it("buy and hold grows with the price, and fills at the first close", () => {
    const run = runBacktest([{ symbol: "A", points: series([100, 110, 121]) }], buyAndHold({ A: 1 }), all);
    expect(run.equity.map((p) => p.price)).toEqual([1000, 1100, 1210]);
    expect(run.trades).toHaveLength(1);
    expect(run.trades[0]).toMatchObject({ side: "buy", price: 100, shares: 10 });
    expect(run.metrics.totalReturn).toBeCloseTo(0.21);
  });

  it("never shows a strategy today's price (no look-ahead)", () => {
    const prices = [10, 11, 12, 13, 14];
    const seen: StrategyContext[] = [];
    const spy: Strategy = (context) => {
      seen.push(context);
      return null;
    };
    runBacktest([{ symbol: "A", points: series(prices) }], spy, all);
    seen.forEach((context, day) => {
      expect(context.day).toBe(day);
      expect(context.closes.A).toEqual(prices.slice(0, day)); // up to yesterday only
    });
  });

  it("charges commission and slippage", () => {
    const costs = { commission: 10, slippageBps: 100 }; // $10 and 1%
    const run = runBacktest([{ symbol: "A", points: series([100, 100]) }], buyAndHold({ A: 1 }), { ...all, costs });
    // $990 left after commission, buying at $101 (1% above the close).
    expect(run.trades[0].price).toBeCloseTo(101);
    expect(run.trades[0].shares).toBeCloseTo(990 / 101);
    expect(run.equity[1].price).toBeCloseTo((990 / 101) * 100); // worth less than $1,000 straight away
  });

  it("refuses a range with too little data", () => {
    expect(() => runBacktest([{ symbol: "A", points: series([100]) }], buyAndHold({ A: 1 }), all)).toThrow(/Not enough/);
  });
});

describe("alignSeries", () => {
  it("keeps only the days every symbol has, within the range", () => {
    const a = series([1, 2, 3, 4]);
    const b = [a[0], a[2], a[3]].map((p) => ({ ...p, price: p.price * 10 }));
    const { times, closes } = alignSeries(
      [
        { symbol: "A", points: a },
        { symbol: "B", points: b },
      ],
      a[0].time,
      a[2].time,
    );
    expect(times).toEqual([a[0].time, a[2].time]);
    expect(closes).toEqual({ A: [1, 3], B: [10, 30] });
  });
});

describe("strategies", () => {
  it("moving-average crossover buys the day after an uptrend becomes visible", () => {
    // Flat for 10 days, then rising. With fast = 2 and slow = 5, the uptrend
    // shows in the closes through day 10, so the buy fills at day 11's close.
    const prices = [...Array(10).fill(100), 101, 102, 103, 104, 105];
    const points = series(prices);
    const run = runBacktest([{ symbol: "A", points }], movingAverageCrossover({ A: 1 }, 2, 5), all);
    expect(run.trades).toHaveLength(1);
    expect(run.trades[0]).toMatchObject({ side: "buy", time: points[11].time, price: 102 });
  });

  it("moving-average crossover sells when the trend turns down", () => {
    const prices = [...Array(6).fill(100), 105, 110, 115, 100, 90, 80, 70];
    const run = runBacktest([{ symbol: "A", points: series(prices) }], movingAverageCrossover({ A: 1 }, 2, 5), all);
    expect(run.trades.map((t) => t.side)).toEqual(["buy", "sell"]);
    expect(run.equity.at(-1)?.price).toBeCloseTo(run.equity.at(-2)?.price ?? 0); // in cash at the end
  });

  it("moving-average crossover buys again after selling out", () => {
    // Bought at 102 and sold at 112: 1000 / 102 shares, times 112, divided by 112 comes out a hair
    // under 1000 / 102. A full sell must still sell every share, or the leftover sliver would count
    // as holding the stock and the strategy would never buy again.
    const prices = [...Array(10).fill(100), 101, 102, 110, 120, 132, 132, 122, 112, 112, 112, 112, 112, 117, 122, 127, 132];
    const run = runBacktest([{ symbol: "A", points: series(prices) }], movingAverageCrossover({ A: 1 }, 2, 5), all);
    expect(run.trades.map((t) => `${t.side} ${t.price}`)).toEqual(["buy 102", "sell 112", "buy 122"]);
  });

});

describe("computeMetrics", () => {
  const point = (days: number, price: number) => ({ time: days * 86_400_000, price });

  it("measures the worst fall from a peak", () => {
    const metrics = computeMetrics([point(0, 100), point(1, 120), point(2, 90), point(3, 130)], 0, 1);
    expect(metrics.maxDrawdown).toBeCloseTo(0.25);
    expect(metrics.drawdownPeak).toBe(86_400_000);
    expect(metrics.drawdownTrough).toBe(2 * 86_400_000);
  });

  it("annualizes growth: doubling in exactly a year is +100% a year", () => {
    expect(computeMetrics([point(0, 100), point(365.25, 200)], 0, 1).cagr).toBeCloseTo(1);
  });

  it("has no Sharpe ratio and no volatility for a flat line", () => {
    const metrics = computeMetrics([point(0, 100), point(1, 100), point(2, 100)], 0, 0);
    expect(metrics).toMatchObject({ volatility: 0, sharpe: null, totalReturn: 0 });
  });
});

describe("config", () => {
  const symbols = (s: string) => ["AAPL", "MSFT", "V"].includes(s);
  const valid: BacktestConfig = {
    version: 2,
    holdings: [
      { symbol: "AAPL", weight: 0.6 },
      { symbol: "MSFT", weight: 0.4 },
    ],
    strategy: { kind: "moving-average", fast: 20, slow: 50 },
    start: 1,
    end: 2,
    initialCash: 10_000,
    costs: { commission: 1, slippageBps: 5 },
    benchmark: "market",
  };

  it("accepts a valid config and drops unknown fields", () => {
    expect(parseConfig({ ...valid, extra: 1 }, symbols)).toEqual(valid);
  });

  it.each([
    ["weights not adding to 1", { ...valid, holdings: [{ symbol: "AAPL", weight: 0.5 }] }],
    ["an unknown symbol", { ...valid, holdings: [{ symbol: "ZZZ", weight: 1 }] }],
    ["a repeated symbol", { ...valid, holdings: [valid.holdings[0], { ...valid.holdings[0], weight: 0.4 }] }],
    ["fast average not shorter than slow", { ...valid, strategy: { kind: "moving-average", fast: 50, slow: 20 } }],
    ["an unknown strategy", { ...valid, strategy: { kind: "yolo" } }],
    ["end before start", { ...valid, start: 5, end: 1 }],
    ["absurd cash", { ...valid, initialCash: 1e12 }],
    ["negative costs", { ...valid, costs: { commission: -1, slippageBps: 0 } }],
    ["a version from a newer app", { ...valid, version: 3 }],
    ["a nonsense version", { ...valid, version: "2" }],
  ])("rejects %s", (_, config) => {
    expect(parseConfig(config, symbols)).toBeNull();
  });

});

describe("saved runs in the browser", () => {
  const symbols = (s: string) => s === "AAPL";
  const saved = {
    id: "r1",
    name: "My run",
    createdAt: 1,
    config: {
      holdings: [{ symbol: "AAPL", weight: 1 }],
      strategy: { kind: "buy-and-hold" },
      start: 1,
      end: 2,
      initialCash: 10_000,
      costs: { commission: 0, slippageBps: 0 },
      benchmark: "market",
    },
    summary: { finalValue: 1, totalReturn: 0, cagr: 0, maxDrawdown: 0, benchmarkTotalReturn: 0 },
  };

  it("reads back valid runs and drops broken ones individually", async () => {
    const { decodeSavedRuns } = await import("./saved-local");
    const raw = JSON.stringify({ version: 1, runs: [saved, { ...saved, id: "r2", summary: { finalValue: "lots" } }] });
    expect(decodeSavedRuns(raw, symbols).map((r) => r.id)).toEqual(["r1"]);
    expect(decodeSavedRuns("not json", symbols)).toEqual([]);
    expect(decodeSavedRuns(JSON.stringify({ version: 9, runs: [saved] }), symbols)).toEqual([]);
  });

  it("keeps runs on any well-formed symbol by default, so a stock missing from today's data doesn't lose them", async () => {
    const { decodeSavedRuns } = await import("./saved-local");
    const onKo = { ...saved, config: { ...saved.config, holdings: [{ symbol: "KO", weight: 1 }] } };
    expect(decodeSavedRuns(JSON.stringify({ version: 1, runs: [onKo] })).map((r) => r.id)).toEqual(["r1"]);
  });
});
