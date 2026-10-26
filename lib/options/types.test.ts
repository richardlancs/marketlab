import { describe, expect, it } from "vitest";
import { parseChain, parsePayoff } from "./types";

const greeks = { price: 5, delta: 0.5, gamma: 0.02, theta: -0.03, vega: 0.2, rho: 0.1 };

describe("options data from the analytics service", () => {
  it("is checked field by field", () => {
    const chain = { spot: 100, volatility: 0.3, rate: 0.04, dividendYield: 0, asOf: 1, expiries: [{ expiry: "2026-11-20", days: 25, strikes: [{ strike: 100, call: greeks, put: greeks }] }] };
    expect(parseChain(chain)).toEqual(chain);
    expect(parseChain({ ...chain, expiries: [{ ...chain.expiries[0], strikes: [{ strike: 100, call: { price: 5 }, put: greeks }] }] })).toBeNull();
    const payoff = { prices: [90, 100, 110], profit: [-5, -5, 5], breakevens: [105], maxProfit: null, maxLoss: -5, netPremium: -5 };
    expect(parsePayoff(payoff)).toEqual(payoff);
    expect(parsePayoff({ ...payoff, profit: [-5] })).toBeNull();
    expect(parsePayoff({ ...payoff, maxLoss: "lots" })).toBeNull();
  });
});
