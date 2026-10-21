import { describe, expect, it } from "vitest";
import { analyseRun } from "./analysis";
import { computeMetrics, type BacktestRun, type BacktestTrade } from "./engine";

const DAY = 86_400_000;
const run = (prices: number[], trades: BacktestTrade[] = []): BacktestRun => {
  const equity = prices.map((price, i) => ({ time: i * DAY, price }));
  return { equity, trades, metrics: computeMetrics(equity, trades.length, 1) };
};
const noCosts = { costs: { commission: 0, slippageBps: 0 } };

describe("analyseRun", () => {
  it("measures a strategy that moves exactly twice as much as its benchmark", () => {
    const bench = [100];
    const strat = [100];
    const moves = [0.01, -0.02, 0.015, -0.005, 0.02, -0.01, 0.005];
    for (const m of moves) {
      bench.push(bench[bench.length - 1] * (1 + m));
      strat.push(strat[strat.length - 1] * (1 + 2 * m));
    }
    const a = analyseRun(run(strat), run(bench), noCosts);
    expect(a.beta).toBeCloseTo(2, 9);
    expect(a.correlation).toBeCloseTo(1, 9);
    expect(a.alpha).toBeCloseTo(0, 9);
    expect(a.trackingError).toBeGreaterThan(0);
    expect(a.sortino).not.toBeNull();
  });

  it("finds round trips, wins and losses, and holding periods", () => {
    const trades: BacktestTrade[] = [
      { time: 0, symbol: "A", side: "buy", shares: 10, price: 10, commission: 1 },
      { time: 5 * DAY, symbol: "A", side: "sell", shares: 10, price: 12, commission: 1 }, // +18
      { time: 6 * DAY, symbol: "A", side: "buy", shares: 5, price: 20, commission: 1 },
      { time: 7 * DAY, symbol: "A", side: "buy", shares: 5, price: 20, commission: 1 },
      { time: 10 * DAY, symbol: "A", side: "sell", shares: 10, price: 18, commission: 1 }, // 179 - 202 = -23
      { time: 11 * DAY, symbol: "A", side: "buy", shares: 1, price: 18, commission: 1 }, // still open: not counted
    ];
    const a = analyseRun(run(Array.from({ length: 12 }, () => 100), trades), run(Array.from({ length: 12 }, () => 100)), noCosts);
    expect(a.roundTrips).toBe(2);
    expect(a.winRate).toBe(0.5);
    expect(a.averageGain).toBeCloseTo(18);
    expect(a.averageLoss).toBeCloseTo(-23);
    expect(a.averageHoldingDays).toBeCloseTo(4.5);
    expect(a.commissions).toBe(6);
  });

  it("works out slippage from the fill prices", () => {
    const trades: BacktestTrade[] = [{ time: 0, symbol: "A", side: "buy", shares: 1, price: 100 * 1.01, commission: 0 }];
    const a = analyseRun(run([100, 100]), run([100, 100]), { costs: { commission: 0, slippageBps: 100 } });
    expect(analyseRun(run([100, 100], trades), run([100, 100]), { costs: { commission: 0, slippageBps: 100 } }).slippage).toBeCloseTo(1);
    expect(a.slippage).toBe(0);
  });

  it("leaves ratios empty when they'd divide by nothing", () => {
    const a = analyseRun(run([100, 100, 100]), run([100, 100, 100]), noCosts);
    expect([a.sortino, a.calmar, a.beta, a.trackingError, a.winRate]).toEqual([null, null, null, null, null]);
  });
});
