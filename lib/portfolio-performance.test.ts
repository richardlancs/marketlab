import { describe, expect, it } from "vitest";
import { computeMetrics } from "./backtest/engine";
import { performance } from "./portfolio-performance";
import type { Account } from "./trading";
import type { PricePoint } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const days = (n: number, price: (i: number) => number): PricePoint[] => Array.from({ length: n }, (_, i) => ({ time: Date.UTC(2026, 0, 1) + i * DAY, price: price(i) }));

const index = days(400, (i) => 1000 + i);
const ko = days(400, (i) => 50 + i * 0.1);
const account: Account = { cash: 100, holdings: [{ symbol: "KO", shares: 10, averageCost: 50 }], watchlist: [], trades: [] };

describe("portfolio performance", () => {
  it("values the portfolio on each of the index's days in the range, with both sides' measures", () => {
    const result = performance(account, { KO: ko }, index, "1M");
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.times.length).toBeGreaterThan(20);
    expect(result.portfolio.at(-1)).toBeCloseTo(100 + 10 * ko.at(-1)!.price, 6);
    expect(result.indexValues.at(-1)).toBe(index.at(-1)!.price);
    expect(result.metrics.index).toEqual(computeMetrics(index.slice(-result.times.length), 0, 1));
    expect(result.firstTrade).toBeNull();
  });

  it("says when a held stock has no prices, or the range is too short", () => {
    expect(performance(account, {}, index, "1Y").status).toBe("missing-prices");
    expect(performance(account, { KO: ko }, index.slice(0, 1), "1Y").status).toBe("too-short");
  });
});
