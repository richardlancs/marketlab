import { describe, expect, it } from "vitest";
import {
  AS_OF_DAY,
  generateQuote,
  getIndices,
  getStock,
  getStocks,
  getTopMovers,
  STOCK_SYMBOLS,
  tradingDays,
} from "./mock-data";
import { startingAccount } from "./starting-account";
import { parseAccount } from "./trading";
import { TIMEFRAMES } from "./types";

describe("tradingDays", () => {
  it("ends on the as-of day and skips weekends", () => {
    const days = tradingDays(252);
    expect(days).toHaveLength(252);
    expect(days.at(-1)).toBe(AS_OF_DAY);
    for (const day of days) {
      expect([0, 6]).not.toContain(new Date(day).getUTCDay());
    }
  });

  it("is in chronological order", () => {
    const days = tradingDays(30);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
  });
});

describe("generateQuote", () => {
  const spec = { symbol: "TEST", name: "Test Co.", price: 100, dailyVolatility: 0.02 };

  it("is deterministic", () => {
    expect(generateQuote(spec)).toEqual(generateQuote(spec));
  });

  it("has the expected number of points per timeframe", () => {
    const { history } = generateQuote(spec);
    expect(history["1D"]).toHaveLength(79); // 9:30–16:00 every 5 minutes
    expect(history["1W"]).toHaveLength(70); // 5 days × 14 half-hour points
    expect(history["1M"]).toHaveLength(22);
    expect(history["1Y"]).toHaveLength(252);
  });
});

describe("stocks", () => {
  it("every timeframe ends at the current price", async () => {
    for (const stock of await getStocks()) {
      for (const tf of TIMEFRAMES) {
        expect(stock.history[tf].at(-1)?.price).toBe(stock.price);
      }
    }
  });

  it("every series is in time order with valid prices", async () => {
    for (const stock of await getStocks()) {
      for (const tf of TIMEFRAMES) {
        const points = stock.history[tf];
        for (let i = 0; i < points.length; i++) {
          expect(Number.isFinite(points[i].price)).toBe(true);
          expect(points[i].price).toBeGreaterThan(0);
          if (i > 0) expect(points[i].time).toBeGreaterThan(points[i - 1].time);
        }
      }
    }
  });

  it("has consistent change figures", async () => {
    for (const stock of await getStocks()) {
      expect(stock.change).toBeCloseTo(stock.price - stock.previousClose, 2);
      expect(stock.changePercent).toBeCloseTo(stock.change / stock.previousClose, 4);
      expect(stock.high).toBeGreaterThanOrEqual(stock.low);
      expect(stock.high).toBeGreaterThanOrEqual(stock.price);
      expect(stock.low).toBeLessThanOrEqual(stock.price);
    }
  });

  it("looks up by symbol", async () => {
    expect((await getStock("AAPL"))?.name).toBe("Apple Inc.");
    expect(await getStock("NOPE")).toBeUndefined();
  });
});

describe("other getters", () => {
  it("returns three indices", async () => {
    expect((await getIndices()).map((i) => i.symbol)).toEqual(["SPX", "IXIC", "DJI"]);
  });

  it("sorts top movers strongest first", async () => {
    const { gainers, losers } = await getTopMovers(3);
    expect(gainers.every((s) => s.changePercent > 0)).toBe(true);
    expect(losers.every((s) => s.changePercent < 0)).toBe(true);
    // AMZN moved -$0.01 (shown as 0.00%), too small to count as a loser.
    expect(losers.map((s) => s.symbol)).not.toContain("AMZN");
    for (let i = 1; i < gainers.length; i++) expect(gainers[i].changePercent).toBeLessThanOrEqual(gainers[i - 1].changePercent);
    for (let i = 1; i < losers.length; i++) expect(losers[i].changePercent).toBeGreaterThanOrEqual(losers[i - 1].changePercent);
  });

  it("starts accounts with stocks that exist", () => {
    // parseAccount rejects any symbol not in the dataset.
    expect(parseAccount(startingAccount(), STOCK_SYMBOLS)).toEqual(startingAccount());
  });
});
