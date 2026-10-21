import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { factorProfile, marketFactor } from "./factors";
import { ANCHOR_DAY, mockSeries } from "./mock";

const NOW = Date.UTC(2026, 9, 20, 22);
const returnsOf = (symbol: string) => {
  const bars = mockSeries(symbol, NOW).bars;
  return bars.slice(1).map((b, i) => Math.log(b.adjClose / bars[i].adjClose));
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const covariance = (a: number[], b: number[]) => {
  const ma = mean(a);
  const mb = mean(b);
  return a.reduce((sum, x, i) => sum + (x - ma) * (b[i] - mb), 0) / (a.length - 1);
};
const sd = (xs: number[]) => Math.sqrt(covariance(xs, xs));
const correlation = (a: number[], b: number[]) => covariance(a, b) / (sd(a) * sd(b));

describe("the mock market's shared moves", () => {
  const market = returnsOf("SPX");

  it("gives the S&P 500 a realistic volatility, with calm and stormy stretches", () => {
    const yearly = sd(market) * Math.sqrt(252);
    expect(yearly).toBeGreaterThan(0.11);
    expect(yearly).toBeLessThan(0.24);
    // Volatility clustering: big moves follow big moves (squared returns are autocorrelated).
    const squares = market.map((r) => r * r);
    expect(correlation(squares.slice(1), squares.slice(0, -1))).toBeGreaterThan(0.05);
  });

  it("follows the real market's path: the 2022 bear market, then new highs", () => {
    const level = (date: string) => Math.exp(marketFactor(ANCHOR_DAY).levels[marketFactor(ANCHOR_DAY).days.findIndex((d) => d >= Date.parse(`${date}T00:00:00Z`))]);
    expect(level("2022-10-12") / level("2022-01-03")).toBeLessThan(0.8); // about −25%
    expect(level("2024-12-06")).toBeGreaterThan(level("2022-01-03") * 1.2);
  });

  it("realises each stock's beta, roughly", () => {
    for (const symbol of ["AAPL", "NVDA", "KO", "DUK", "TSLA", "JPM"]) {
      const beta = covariance(returnsOf(symbol), market) / covariance(market, market);
      expect(beta, symbol).toBeGreaterThan(factorProfile(symbol).beta * 0.75);
      expect(beta, symbol).toBeLessThan(factorProfile(symbol).beta * 1.25);
    }
  });

  it("moves stocks together, more so within a sector", () => {
    const semis = ["NVDA", "AMD", "AVGO", "QCOM"].map(returnsOf);
    const within = correlation(semis[0], semis[1]);
    const across = correlation(returnsOf("NVDA"), returnsOf("KO"));
    expect(within).toBeGreaterThan(0.45);
    expect(across).toBeGreaterThan(0.1);
    expect(across).toBeLessThan(within);
    // And every catalog stock is positively correlated with the market.
    for (const { symbol } of CATALOG) expect(correlation(returnsOf(symbol), market), symbol).toBeGreaterThan(0.2);
  });

  it("gives the Nasdaq a higher beta than the Dow", () => {
    const beta = (symbol: string) => covariance(returnsOf(symbol), market) / covariance(market, market);
    expect(beta("IXIC")).toBeGreaterThan(1.1);
    expect(beta("DJI")).toBeLessThan(1.05);
  });
});
