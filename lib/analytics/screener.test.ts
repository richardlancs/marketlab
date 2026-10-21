import { describe, expect, it } from "vitest";
import { parseConfig } from "../backtest/config";
import type { CompanyFacts } from "../market/fundamentals";
import type { StockProfile } from "./profile";
import { applyScreen, backtestOfScreen, buildRows, EMPTY_SCREEN, percentiles, PRESETS, type ScreenerRow } from "./screener";

const row = (symbol: string, over: Partial<ScreenerRow> = {}): ScreenerRow => ({
  symbol,
  name: symbol,
  sector: "Technology",
  price: 100,
  marketCap: 1e9,
  peRatio: 20,
  dividendYield: 0,
  priceToSales: null,
  revenueGrowth: null,
  netMargin: null,
  returnOnEquity: null,
  freeCashFlowYield: null,
  r1M: 0,
  r3M: 0,
  r1Y: 0,
  momentum: 0,
  volatility: 0.2,
  beta: 1,
  rsi: 50,
  fromHigh: 0.1,
  trend: "above",
  cross: "golden",
  momentumRank: 0.5,
  momentumSectorRank: 0.5,
  volatilityRank: 0.5,
  ...over,
});

describe("percentiles", () => {
  it("ranks from 0 to 1, sharing ties and skipping missing values", () => {
    expect(percentiles([10, 30, 20, null, 30])).toEqual([0, 5 / 6, 1 / 3, null, 5 / 6]);
    expect(percentiles([7])).toEqual([0.5]);
    expect(percentiles([null])).toEqual([null]);
  });
});

describe("applyScreen", () => {
  const rows = [
    row("AAA", { sector: "Energy", beta: 0.6, rsi: 35, dividendYield: 0.04, marketCap: 5e9 }),
    row("BBB", { beta: 1.4, momentumRank: 0.9, momentum: 0.5, marketCap: 9e9 }),
    row("CCC", { beta: null, trend: "below", marketCap: 1e9 }),
  ];

  it("filters by sector, trend, ranges and ranks, leaving out rows missing a filtered value", () => {
    expect(applyScreen(rows, { ...EMPTY_SCREEN, sectors: ["Energy"] }).map((r) => r.symbol)).toEqual(["AAA"]);
    expect(applyScreen(rows, { ...EMPTY_SCREEN, trend: "above" }).map((r) => r.symbol)).toEqual(["BBB", "AAA"]);
    expect(applyScreen(rows, { ...EMPTY_SCREEN, ranges: { beta: { max: 1 } } }).map((r) => r.symbol)).toEqual(["AAA"]);
    expect(applyScreen(rows, { ...EMPTY_SCREEN, momentumRankMin: 0.8 }).map((r) => r.symbol)).toEqual(["BBB"]);
  });

  it("sorts either way, with missing values last", () => {
    expect(applyScreen(rows, { ...EMPTY_SCREEN, sort: "beta", descending: false }).map((r) => r.symbol)).toEqual(["AAA", "BBB", "CCC"]);
    expect(applyScreen(rows, { ...EMPTY_SCREEN, sort: "beta", descending: true }).map((r) => r.symbol)).toEqual(["BBB", "AAA", "CCC"]);
    expect(applyScreen(rows, { ...EMPTY_SCREEN, sort: "symbol", descending: false }).map((r) => r.symbol)).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("has presets that each select something sensible", () => {
    const reported = [
      row("DDD", { beta: null, trend: "below", netMargin: 0.25, returnOnEquity: 0.3, revenueGrowth: 0.2, peRatio: 30, freeCashFlowYield: 0.02 }),
      row("EEE", { beta: null, trend: "below", netMargin: 0.1, returnOnEquity: 0.12, revenueGrowth: 0.02, peRatio: 11, freeCashFlowYield: 0.07 }),
    ];
    const byId = Object.fromEntries(PRESETS.map((p) => [p.id, applyScreen([...rows, ...reported], p.screen).map((r) => r.symbol)]));
    expect(byId.momentum).toEqual(["BBB"]);
    expect(byId.dividends).toEqual(["AAA"]);
    expect(byId.defensive).toEqual(["AAA"]);
    expect(byId.oversold).toEqual(["AAA"]);
    expect(byId.quality).toEqual(["DDD"]);
    expect(byId.value).toEqual(["EEE"]);
    expect(byId.growth).toEqual(["DDD"]);
  });
});

describe("buildRows", () => {
  const profile = { price: 50, returns: {}, risk: {}, technicals: { states: {} }, income: { dividendYield: null } } as unknown as StockProfile;
  const year = (end: string, revenue: number, netIncome: number) => ({ start: "", end, revenue, grossProfit: null, operatingIncome: null, netIncome, eps: null, dilutedShares: null, equity: 400, operatingCashFlow: null, capitalSpending: null, freeCashFlow: null });
  const facts: CompanyFacts = { cik: 1, name: "X", filed: "", years: [year("2024-12-31", 800, 80), year("2025-12-31", 1000, 100)], trailing: { end: "2025-12-31", revenue: 1000, grossProfit: null, operatingIncome: null, netIncome: 100, eps: null } };
  const input = { symbol: "X", name: "X", sector: "Tech", profile, marketCap: 2000, peRatio: 99, dividendYield: null };

  it("adds reported numbers, with P/E from earnings rather than the price source's", () => {
    const [r] = buildRows([{ ...input, facts }]);
    expect(r).toMatchObject({ peRatio: 20, priceToSales: 2, revenueGrowth: 0.25, netMargin: 0.1, returnOnEquity: 0.25 });
    // A loss: no P/E, not the source's.
    const losing = { ...facts, trailing: { ...facts.trailing!, netIncome: -5 } };
    expect(buildRows([{ ...input, facts: losing }])[0].peRatio).toBeNull();
  });

  it("keeps the source's numbers without reported ones", () => {
    expect(buildRows([input])[0]).toMatchObject({ peRatio: 99, netMargin: null, revenueGrowth: null });
  });
});

describe("backtestOfScreen", () => {
  it("makes valid settings: up to five stocks, equal weights adding up to 1", () => {
    const rows = ["A", "B", "C", "D", "E", "F"].map((s) => row(s));
    const config = backtestOfScreen(rows, Date.UTC(2026, 9, 20))!;
    expect(config.holdings.map((h) => h.symbol)).toEqual(["A", "B", "C", "D", "E"]);
    expect(config.holdings.reduce((sum, h) => sum + h.weight, 0)).toBeCloseTo(1, 9);
    expect(parseConfig(config, () => true)).not.toBeNull();
    const three = backtestOfScreen(rows.slice(0, 3), Date.UTC(2026, 9, 20))!;
    expect(parseConfig(three, () => true)).not.toBeNull();
    expect(backtestOfScreen([], 0)).toBeNull();
  });
});
