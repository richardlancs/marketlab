import { describe, expect, it } from "vitest";
import { sliceTimeframe } from "../chart";
import { startingAccount } from "../starting-account";
import { parseAccount } from "../trading";
import { buildMarket, toQuote } from "./build";
import { DAY, isTradingDay, latestClosedTradingDay, tradingDaysAfter, tradingDaysEndingAt } from "./calendar";
import { ACTIONS_START, ANCHOR_DAY, HISTORY_BARS, mockProvider, mockSeries } from "./mock";
import { INDICES, STOCK_SYMBOLS } from "./universe";

/** A moment in New York time during daylight saving (UTC−4). */
const newYork = (y: number, m: number, d: number, hour: number) => Date.UTC(y, m - 1, d, hour + 4);
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe("calendar", () => {
  it("knows which days the market trades", () => {
    expect(isTradingDay(day(2026, 10, 16))).toBe(true); // Friday
    expect(isTradingDay(day(2026, 10, 17))).toBe(false); // Saturday
    expect(isTradingDay(day(2026, 10, 18))).toBe(false); // Sunday
  });

  it("counts today's close only once it has happened (4 PM New York)", () => {
    expect(latestClosedTradingDay(newYork(2026, 10, 19, 15))).toBe(day(2026, 10, 16)); // Monday 3 PM → Friday
    expect(latestClosedTradingDay(newYork(2026, 10, 19, 16))).toBe(day(2026, 10, 19)); // Monday 4 PM → Monday
    expect(latestClosedTradingDay(newYork(2026, 10, 18, 12))).toBe(day(2026, 10, 16)); // Sunday → Friday
    expect(latestClosedTradingDay(newYork(2026, 10, 17, 20))).toBe(day(2026, 10, 16)); // Saturday evening → Friday
  });

  it("uses New York's date, not UTC's", () => {
    // 11 PM in New York on Monday is already Tuesday in UTC.
    expect(latestClosedTradingDay(newYork(2026, 10, 19, 23))).toBe(day(2026, 10, 19));
    // Winter time (UTC−5): 4:30 PM on a December Tuesday.
    expect(latestClosedTradingDay(Date.UTC(2026, 11, 1, 21, 30))).toBe(day(2026, 12, 1));
  });

  it("lists trading days in order, skipping weekends", () => {
    const days = tradingDaysEndingAt(day(2026, 10, 16), 10);
    expect(days).toHaveLength(10);
    expect(days.at(-1)).toBe(day(2026, 10, 16));
    expect(days.every(isTradingDay)).toBe(true);
    expect(tradingDaysAfter(day(2026, 10, 16), day(2026, 10, 20))).toEqual([day(2026, 10, 19), day(2026, 10, 20)]);
  });
});

describe("mock market", () => {
  const atAnchor = newYork(2026, 10, 16, 18);
  const aWeekLater = newYork(2026, 10, 23, 18);

  it("keeps 5 years of daily bars, in order, with sane prices", () => {
    const { bars } = mockSeries("AAPL", aWeekLater);
    expect(bars).toHaveLength(HISTORY_BARS);
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      expect(bar.close).toBeGreaterThan(0);
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
      if (i > 0) expect(bar.time).toBeGreaterThan(bars[i - 1].time);
    }
  });

  it("matches the original dataset on the anchor day", () => {
    const { bars } = mockSeries("AAPL", atAnchor);
    expect(bars.at(-1)?.close).toBe(248.3);
    expect(Math.floor((bars.at(-1)?.time ?? 0) / DAY) * DAY).toBe(ANCHOR_DAY);
  });

  it("moves forward with the calendar without rewriting the past", () => {
    const before = mockSeries("NVDA", atAnchor).bars;
    const after = mockSeries("NVDA", aWeekLater).bars;
    expect(after.at(-1)?.time).toBe(day(2026, 10, 23) + 20 * 60 * 60 * 1000);
    // Every day that existed before still has exactly the same bar.
    const byTime = new Map(after.map((b) => [b.time, b]));
    for (const bar of before.slice(-200)) expect(byTime.get(bar.time)).toEqual(bar);
  });

  it("is deterministic", () => {
    expect(mockSeries("TSLA", aWeekLater)).toEqual(mockSeries("TSLA", aWeekLater));
  });

  it("has fundamentals for stocks but not for indices", () => {
    expect(mockSeries("MSFT", atAnchor).peRatio).toBeGreaterThan(0);
    expect(mockSeries("SPX", atAnchor)).toMatchObject({ marketCap: null, peRatio: null });
    expect(mockSeries("SPX", atAnchor).bars.at(-1)?.volume).toBeNull();
  });

  it("refuses malformed symbols", () => {
    expect(() => mockSeries("../x", atAnchor)).toThrow();
  });

  it("generates a steady series for any other symbol", () => {
    const ko = mockSeries("KO", aWeekLater);
    expect(ko.bars).toHaveLength(HISTORY_BARS);
    expect(mockSeries("KO", aWeekLater)).toEqual(ko);
    expect(ko.marketCap).toBeGreaterThan(0);
    // A later day only adds bars at the end; the past stays the same.
    const before = mockSeries("KO", atAnchor).bars;
    expect(ko.bars.slice(0, -5)).toEqual(before.slice(5));
    // Different symbols get different prices.
    expect(mockSeries("PEP", atAnchor).bars.at(-1)?.close).not.toBe(before.at(-1)?.close);
  });

  it("lists exactly the catalog's stocks", async () => {
    expect(await mockProvider.getListing("KO")).toEqual({ symbol: "KO", name: "Coca-Cola Co.", sector: "Consumer Staples" });
    expect(await mockProvider.getListing("ZZZZ")).toBeNull();
  });
});

describe("quotes and the market snapshot", () => {
  it("computes today's change from the last two closes", () => {
    const bar = (time: number, close: number) => ({ time, open: close, high: close, low: close, close, volume: 1, adjClose: close });
    const quote = toQuote("X", "X Corp", [bar(1, 100), bar(2, 103)]);
    expect(quote).toMatchObject({ price: 103, previousClose: 100, change: 3, changePercent: 0.03 });
    expect(quote.history).toEqual([
      { time: 1, price: 100 },
      { time: 2, price: 103 },
    ]);
  });

  it("builds every stock and index, as of the latest close", async () => {
    const market = await buildMarket(mockProvider, newYork(2026, 10, 19, 17));
    expect(market.source).toBe("mock");
    expect(market.stocks.map((s) => s.symbol)).toEqual(STOCK_SYMBOLS);
    expect(market.indices.map((i) => i.symbol)).toEqual(INDICES.map((i) => i.symbol));
    expect(market.asOf).toBe(day(2026, 10, 19) + 20 * 60 * 60 * 1000);
    for (const stock of market.stocks) {
      expect(stock.change).toBeCloseTo(stock.price - stock.previousClose, 2);
      expect(stock.history.at(-1)?.price).toBe(stock.price);
    }
  });

  it("starts accounts with stocks that exist", () => {
    // parseAccount rejects any symbol not in the universe.
    expect(parseAccount(startingAccount(), (s) => STOCK_SYMBOLS.includes(s))).toEqual(startingAccount());
  });
});

describe("sliceTimeframe", () => {
  // Every weekday from Jan 2021 to Oct 16, 2026, as daily points.
  const history = tradingDaysEndingAt(day(2026, 10, 16), 1500).map((d) => ({ time: d + 20 * 3600_000, price: 1 }));
  const first = (tf: Parameters<typeof sliceTimeframe>[1]) => new Date(sliceTimeframe(history, tf)[0].time).toISOString().slice(0, 10);

  it("starts at the last close on or before the same date one range earlier", () => {
    expect(first("1M")).toBe("2026-09-16");
    expect(first("1Y")).toBe("2025-10-16");
    // Oct 16, 2021 was a Saturday, so the range starts from Friday's close.
    expect(first("5Y")).toBe("2021-10-15");
  });

  it("keeps a short history whole", () => {
    expect(sliceTimeframe(history.slice(-5), "1Y")).toHaveLength(5);
    expect(sliceTimeframe([], "1M")).toEqual([]);
  });
});

describe("mock dividends and splits", () => {
  const later = newYork(2027, 6, 1, 18);

  it("only happen from ACTIONS_START on, so earlier closes never change", () => {
    const before = mockSeries("NFLX", newYork(2026, 10, 16, 18)).bars;
    const after = mockSeries("NFLX", later);
    expect(after.actions.every((a) => a.time >= ACTIONS_START)).toBe(true);
    const closes = new Map(after.bars.map((b) => [b.time, b.close]));
    for (const bar of before.slice(-100)) expect(closes.get(bar.time)).toBe(bar.close);
  });

  it("split an expensive stock: the close drops by the ratio, the adjusted history doesn't jump", () => {
    const { bars, actions } = mockSeries("NFLX", later); // $1,184 at the anchor, so it splits right away
    const split = actions.find((a) => a.kind === "split");
    if (split?.kind !== "split") throw new Error("expected a split");
    const i = bars.findIndex((b) => b.time === split.time);
    expect(bars[i].close / bars[i - 1].close).toBeLessThan(0.6);
    expect(bars[i].adjClose / bars[i - 1].adjClose).toBeGreaterThan(0.85);
    expect(bars[i].adjClose / bars[i - 1].adjClose).toBeLessThan(1.15);
  });

  it("pay quarterly dividends on some stocks, deterministically, and never on indices", () => {
    const payers = STOCK_SYMBOLS.filter((s) => mockSeries(s, later).actions.some((a) => a.kind === "dividend"));
    expect(payers.length).toBeGreaterThan(2);
    expect(payers.length).toBeLessThan(STOCK_SYMBOLS.length);
    expect(mockSeries("SPX", later).actions).toEqual([]);
    expect(mockSeries(payers[0], later)).toEqual(mockSeries(payers[0], later));
    // About four a year, and adjusted closes before one are scaled down by it.
    const { bars, actions } = mockSeries(payers[0], later);
    const dividend = actions.find((a) => a.kind === "dividend")!;
    const i = bars.findIndex((b) => b.time === dividend.time);
    expect(bars[i - 1].adjClose).toBeLessThan(bars[i - 1].close);
    // Across the ex-date, the adjusted change is the price change with the dividend added back.
    expect(bars[i].adjClose / bars[i - 1].adjClose).toBeCloseTo(bars[i].close / (bars[i - 1].close - dividend.amount), 3);
  });
});
