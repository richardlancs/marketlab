import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import {
  afterCosts,
  arithmeticExp,
  arithmeticLog,
  beta,
  blackScholes,
  blockVolatilities,
  breakevens,
  compoundPath,
  crossoverReturns,
  dispositionTally,
  equalMix,
  factorContributions,
  FACTORS,
  impliedVolatility,
  lumpSumVersusMonthly,
  metricsOf,
  normal,
  normalCdf,
  orderFill,
  pathBetween,
  pathFromMoves,
  pricePath,
  profitAtExpiry,
  rebalanceDrift,
  recoveryNeeded,
  relatedPaths,
  shockHalfLife,
  simplePath,
  stockWithBeta,
  volatilityMoves,
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

describe("arithmetic exp and log", () => {
  it("match Math.exp and Math.log closely", () => {
    for (const x of [-30, -5, -1, -0.25, 0, 0.01, 0.5, 1, 3, 20]) expect(arithmeticExp(x) / Math.exp(x)).toBeCloseTo(1, 12);
    for (const x of [1e-6, 0.01, 0.5, 0.99, 1, 1.5, 2, 10, 1e6]) expect(arithmeticLog(x)).toBeCloseTo(Math.log(x), 12);
    expect(arithmeticLog(0)).toBe(-Infinity);
    expect(arithmeticExp(1000)).toBe(Infinity);
  });

  it("give the normal curve's known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 6);
    expect(normalCdf(3) + normalCdf(-3)).toBeCloseTo(1, 10);
  });
});

describe("Black-Scholes", () => {
  const inputs = { spot: 100, strike: 100, years: 0.25, volatility: 0.2, rate: 0.04 };
  it("prices the lessons' example and its Greeks", () => {
    const call = blackScholes("call", inputs);
    expect(call.price).toBeCloseTo(4.4852, 3);
    expect(call.delta).toBeCloseTo(0.5596, 3);
    expect(call.gamma).toBeCloseTo(0.03945, 4);
    expect(call.theta).toBeCloseTo(-0.02726, 4);
    expect(call.vega).toBeCloseTo(0.1972, 3);
    expect(call.rho).toBeCloseTo(0.1287, 3);
    const put = blackScholes("put", inputs);
    expect(put.price).toBeCloseTo(3.4902, 3);
    expect(put.delta).toBeCloseTo(call.delta - 1, 10);
  });

  it("obeys put-call parity, and is worth its payoff at expiry", () => {
    for (const spot of [80, 100, 125]) {
      const at = { ...inputs, spot, volatility: 0.35 };
      const parity = blackScholes("call", at).price - blackScholes("put", at).price;
      expect(parity).toBeCloseTo(spot - 100 * Math.exp(-0.04 * 0.25), 6);
    }
    expect(blackScholes("call", { ...inputs, spot: 110, years: 0 }).price).toBe(10);
    expect(blackScholes("put", { ...inputs, spot: 110, years: 0 }).price).toBe(0);
  });

  it("finds the volatility behind a price", () => {
    const rest = { spot: 100, strike: 100, years: 0.25, rate: 0.04 };
    const solved = impliedVolatility("call", 5.5, rest);
    expect(solved?.volatility).toBeCloseTo(0.2514, 3);
    expect(impliedVolatility("put", blackScholes("put", { ...inputs, volatility: 0.42 }).price, rest)?.volatility).toBeCloseTo(0.42, 6);
    expect(impliedVolatility("call", 0.5, rest)).toBeNull();
  });
});

describe("option payoffs", () => {
  const prices = Array.from({ length: 81 }, (_, i) => 60 + i);
  it("are the payoff less the premium, mirrored for the seller", () => {
    const call = { kind: "call" as const, strike: 105, premium: 3, quantity: 1 };
    expect(profitAtExpiry([call], 115)).toBe(7);
    expect(profitAtExpiry([call], 90)).toBe(-3);
    expect(profitAtExpiry([{ ...call, quantity: -1 }], 115)).toBe(-7);
    expect(breakevens([call], prices)).toEqual([108]);
  });

  it("combine into spreads and straddles", () => {
    const spread = [
      { kind: "call" as const, strike: 100, premium: 4.49, quantity: 1 },
      { kind: "call" as const, strike: 110, premium: 1.14, quantity: -1 },
    ];
    expect(profitAtExpiry(spread, 130)).toBeCloseTo(6.65, 10);
    expect(profitAtExpiry(spread, 80)).toBeCloseTo(-3.35, 10);
    expect(breakevens(spread, prices)[0]).toBeCloseTo(103.35, 10);
    const straddle = [
      { kind: "call" as const, strike: 100, premium: 4.49, quantity: 1 },
      { kind: "put" as const, strike: 100, premium: 3.49, quantity: 1 },
    ];
    const [low, high] = breakevens(straddle, prices);
    expect(low).toBeCloseTo(92.02, 10);
    expect(high).toBeCloseTo(107.98, 10);
    const covered = [{ kind: "stock" as const, price: 100, quantity: 1 }, { ...spread[1] }];
    expect(profitAtExpiry(covered, 120)).toBeCloseTo(11.14, 10);
    expect(profitAtExpiry(covered, 90)).toBeCloseTo(-8.86, 10);
  });
});

describe("factor contributions", () => {
  it("add each exposure × factor return, plus alpha", () => {
    const exposures = { Market: 1.2, Size: -0.3, Value: -0.5, Momentum: 0.4, "Low volatility": -0.2 };
    const returns = { Market: 0.1, Size: -0.02, Value: -0.04, Momentum: 0.06, "Low volatility": -0.03 };
    const { parts, total } = factorContributions(exposures, returns, 0.014);
    expect(parts.map((p) => p.factor)).toEqual([...FACTORS]);
    expect(parts[0].contribution).toBeCloseTo(0.12, 10);
    expect(total).toBeCloseTo(0.19, 10);
  });
});

describe("volatility clustering", () => {
  it("gives the same moves for the same seed, and a path from them", () => {
    expect(volatilityMoves(5, 100)).toEqual(volatilityMoves(5, 100));
    expect(volatilityMoves(5, 100, { clustered: false })).toHaveLength(100);
    const path = pathFromMoves([0.1, -0.1]);
    expect(path[1]).toBeCloseTo(110, 10);
    expect(path[2]).toBeCloseTo(99, 10);
  });

  it("keeps about the same overall volatility, but spreads the months far wider", () => {
    const clustered = volatilityMoves(3, 2520);
    const constant = volatilityMoves(3, 2520, { clustered: false });
    const overall = (moves: number[]) => blockVolatilities(moves, moves.length)[0];
    expect(overall(constant)).toBeCloseTo(0.2, 1);
    expect(overall(clustered)).toBeGreaterThan(0.12);
    expect(overall(clustered)).toBeLessThan(0.3);
    const spread = (moves: number[]) => {
      const months = blockVolatilities(moves).sort((a, b) => a - b);
      return months[Math.floor(months.length * 0.9)] / months[Math.floor(months.length * 0.1)];
    };
    expect(spread(clustered)).toBeGreaterThan(spread(constant) * 1.3);
  });

  it("finds a shock's half-life", () => {
    expect(shockHalfLife(0.98)).toBeCloseTo(Math.log(0.5) / Math.log(0.98), 8);
    expect(shockHalfLife(0.5)).toBeCloseTo(1, 10);
    expect(shockHalfLife(1)).toBe(Infinity);
  });
});

describe("the disposition effect", () => {
  it("counts realised and paper gains and losses on selling days", () => {
    const day = [
      { gain: 0.2, sold: true },
      { gain: 0.1, sold: false },
      { gain: 0.03, sold: false },
      { gain: -0.15, sold: false },
      { gain: -0.05, sold: false },
      { gain: 0, sold: false },
    ];
    const t = dispositionTally([day]);
    expect(t).toMatchObject({ realisedGains: 1, paperGains: 2, realisedLosses: 0, paperLosses: 2 });
    expect(t.pgr).toBeCloseTo(1 / 3, 10);
    expect(t.plr).toBe(0);
    expect(t.difference).toBeCloseTo(1 / 3, 10);
    expect(dispositionTally([]).pgr).toBeNull();
  });
});
