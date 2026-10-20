import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import {
  afterCosts,
  beta,
  compoundPath,
  crossoverReturns,
  equalMix,
  lumpSumVersusMonthly,
  metricsOf,
  normal,
  orderFill,
  pathBetween,
  pricePath,
  rebalanceDrift,
  recoveryNeeded,
  relatedPaths,
  simplePath,
  stockWithBeta,
  worstDrawdown,
} from "./demos";

describe("demo prices", () => {
  it("are the same for the same seed, and different for another", () => {
    expect(pricePath(7, 50)).toEqual(pricePath(7, 50));
    expect(pricePath(7, 50)).not.toEqual(pricePath(8, 50));
    expect(pricePath(7, 50)).toHaveLength(51);
  });

  it("land near the volatility they're asked for", () => {
    const calm = metricsOf(pricePath(1, 2520, { annualVolatility: 0.1 }));
    const wild = metricsOf(pricePath(1, 2520, { annualVolatility: 0.4 }));
    expect(calm.volatility).toBeCloseTo(0.1, 1);
    expect(wild.volatility).toBeCloseTo(0.4, 1);
  });

  it("can be made to end at a chosen value", () => {
    const path = pathBetween(4, 100, 112, 252, 0.3);
    expect(path[0]).toBe(100);
    expect(path[252]).toBe(112);
  });

  it("use roughly normal moves", () => {
    const rng = mulberry32(1);
    const samples = Array.from({ length: 20_000 }, () => normal(rng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length);
    expect(mean).toBeCloseTo(0, 1);
    expect(sd).toBeCloseTo(1, 1);
  });

  it("measure a year as 252 trading days", () => {
    expect(metricsOf(compoundDaily(0.1, 252)).cagr).toBeCloseTo(0.1, 2);
  });
});

/** A series rising exactly `rate` over each 252 days. */
const compoundDaily = (rate: number, days: number) => Array.from({ length: days + 1 }, (_, i) => 100 * (1 + rate) ** (i / 252));

describe("growth", () => {
  it("compounds, unlike simple interest", () => {
    expect(compoundPath(10_000, 0.07, 10)[10]).toBeCloseTo(19_671.51, 2);
    expect(simplePath(10_000, 0.07, 10)[10]).toBeCloseTo(17_000, 6);
  });
});

describe("drawdowns", () => {
  it("find the worst fall from a peak", () => {
    expect(worstDrawdown([100, 120, 90, 110, 60, 130])).toEqual({ peak: 1, trough: 4, depth: 0.5 });
    expect(worstDrawdown([1, 2, 3]).depth).toBe(0);
  });

  it("need a bigger gain to recover", () => {
    expect(recoveryNeeded(0.5)).toBeCloseTo(1, 10);
    expect(recoveryNeeded(0.2)).toBeCloseTo(0.25, 10);
  });
});

describe("beta", () => {
  it("is 1 for the market itself and about the target for a linked stock", () => {
    const market = pricePath(3, 1000, { annualVolatility: 0.16 });
    expect(beta(market, market)).toBeCloseTo(1, 10);
    expect(beta(stockWithBeta(4, market, 1.5), market)).toBeCloseTo(1.5, 0);
    expect(beta(stockWithBeta(4, market, 0.5), market)).toBeCloseTo(0.5, 0);
  });
});

describe("diversification", () => {
  it("makes a mix of unrelated stocks calmer than its parts", () => {
    const paths = relatedPaths(5, 10, 1000, 0.2);
    const single = metricsOf(paths[0]).volatility;
    const mix = metricsOf(equalMix(paths)).volatility;
    expect(mix).toBeLessThan(single * 0.7);
  });

  it("does little when the stocks move together", () => {
    const paths = relatedPaths(5, 10, 1000, 0.95);
    expect(metricsOf(equalMix(paths)).volatility).toBeGreaterThan(metricsOf(paths[0]).volatility * 0.85);
  });
});

describe("investing monthly", () => {
  it("buys more shares when prices are low", () => {
    const prices = Array.from({ length: 64 }, (_, i) => (i < 21 ? 10 : i < 42 ? 5 : 10));
    const { averageCost, shares, lump, monthly } = lumpSumVersusMonthly(prices, 300, 3);
    // $100 at $10, $5 and $10: 10 + 20 + 10 = 40 shares, $7.50 each on average.
    expect(shares).toBe(40);
    expect(averageCost).toBe(7.5);
    expect(lump.at(-1)).toBe(300);
    expect(monthly.at(-1)).toBe(400);
  });
});

describe("rebalancing", () => {
  it("keeps the mix at its target, while an untouched one drifts", () => {
    const a = compoundDaily(0.2, 504);
    const b = compoundDaily(0, 504);
    const { drifting, rebalanced } = rebalanceDrift(a, b, 0.6, 63);
    expect(drifting.share.at(-1)!).toBeGreaterThan(0.65);
    expect(rebalanced.share[504]).toBeCloseTo(0.6, 6);
  });
});

describe("orders", () => {
  const closes = [100, 98, 95, 97, 90, 92];
  it("fill at the first close that meets them", () => {
    expect(orderFill(closes, "market", 0)).toEqual({ day: 1, price: 98 });
    expect(orderFill(closes, "limit", 96)).toEqual({ day: 2, price: 95 });
    expect(orderFill(closes, "stop", 91)).toEqual({ day: 4, price: 90 });
    expect(orderFill(closes, "limit", 80)).toBeNull();
  });
});

describe("trading costs", () => {
  it("are nothing with no trades or no costs, and grow with trading", () => {
    expect(afterCosts(10_000, 0.1, 0, 5, 10).cost).toBe(0);
    expect(afterCosts(10_000, 0.1, 20, 0, 0).net).toBeCloseTo(11_000, 6);
    const few = afterCosts(10_000, 0.1, 4, 5, 10).cost;
    const many = afterCosts(10_000, 0.1, 100, 5, 10).cost;
    expect(few).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(few * 10);
  });
});

describe("the overfitting sweep", () => {
  it("gives one result per setting", () => {
    const results = crossoverReturns(pricePath(9, 400), [5, 10, 20], 50);
    expect(results.map((r) => r.fast)).toEqual([5, 10, 20]);
    for (const r of results) expect(Number.isFinite(r.totalReturn)).toBe(true);
  });
});
