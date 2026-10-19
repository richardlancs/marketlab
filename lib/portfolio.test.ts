import { describe, expect, it } from "vitest";
import { summarizePortfolio } from "./portfolio";
import type { Stock } from "./types";

// Only the fields summarizePortfolio reads matter; the cast fills in the rest.
const stock = (symbol: string, price: number, change: number) => ({ symbol, name: symbol, price, change }) as Stock;

describe("summarizePortfolio", () => {
  const stocks = [stock("AAA", 110, 2), stock("BBB", 40, -1)];
  const holdings = [
    { symbol: "AAA", shares: 10, averageCost: 100 }, // worth 1,100, cost 1,000
    { symbol: "BBB", shares: 5, averageCost: 50 }, //   worth 200,   cost 250
  ];

  it("values each position", () => {
    const [aaa, bbb] = summarizePortfolio(holdings, stocks, 0).positions;
    expect(aaa).toMatchObject({ marketValue: 1100, costBasis: 1000, gain: 100, dayChange: 20 });
    expect(aaa.gainPercent).toBeCloseTo(0.1);
    expect(bbb).toMatchObject({ marketValue: 200, costBasis: 250, gain: -50, dayChange: -5 });
    expect(bbb.gainPercent).toBeCloseTo(-0.2);
  });

  it("totals the portfolio, including cash", () => {
    const summary = summarizePortfolio(holdings, stocks, 500);
    expect(summary.totalValue).toBe(1800); // 1,100 + 200 + 500 cash
    expect(summary.costBasis).toBe(1250);
    expect(summary.totalGain).toBe(50);
    expect(summary.totalGainPercent).toBeCloseTo(0.04);
    expect(summary.dayChange).toBe(15);
    // Measured against yesterday's value: 15 / (1,800 - 15)
    expect(summary.dayChangePercent).toBeCloseTo(15 / 1785);
  });

  it("handles an empty portfolio without dividing by zero", () => {
    const summary = summarizePortfolio([], stocks, 1000);
    expect(summary).toMatchObject({ totalValue: 1000, totalGainPercent: 0, dayChangePercent: 0 });
  });

  it("values a stock with no price yet at cost, flagged as unpriced, instead of failing", () => {
    const summary = summarizePortfolio([{ symbol: "ZZZ", shares: 2, averageCost: 5 }], stocks, 100);
    expect(summary.positions[0]).toMatchObject({ symbol: "ZZZ", marketValue: 10, gain: 0, dayChange: 0, priced: false });
    expect(summary.totalValue).toBe(110);
  });
});
