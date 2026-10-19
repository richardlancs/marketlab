import { describe, expect, it } from "vitest";
import { nextSort, sortStocks } from "./sort";

const row = (symbol: string, price: number, changePercent = 0, marketCap = 0, peRatio = 0) => ({
  symbol,
  price,
  changePercent,
  marketCap,
  peRatio,
});

const stocks = [row("MSFT", 512, 0.01, 3.8e12, 36.9), row("AAPL", 248, -0.02, 3.7e12, 35), row("V", 348, 0.004, 0.68e12, 32.8)];
const symbols = (list: { symbol: string }[]) => list.map((s) => s.symbol);

describe("sortStocks", () => {
  it("sorts symbols alphabetically", () => {
    expect(symbols(sortStocks(stocks, { key: "symbol", direction: "asc" }))).toEqual(["AAPL", "MSFT", "V"]);
    expect(symbols(sortStocks(stocks, { key: "symbol", direction: "desc" }))).toEqual(["V", "MSFT", "AAPL"]);
  });

  it("sorts numbers by value, not as text", () => {
    expect(symbols(sortStocks(stocks, { key: "price", direction: "desc" }))).toEqual(["MSFT", "V", "AAPL"]);
    expect(symbols(sortStocks(stocks, { key: "changePercent", direction: "asc" }))).toEqual(["AAPL", "V", "MSFT"]);
    expect(symbols(sortStocks(stocks, { key: "marketCap", direction: "desc" }))).toEqual(["MSFT", "AAPL", "V"]);
    expect(symbols(sortStocks(stocks, { key: "peRatio", direction: "asc" }))).toEqual(["V", "AAPL", "MSFT"]);
  });

  it("breaks ties by symbol, whichever the direction", () => {
    const tied = [row("NVDA", 100), row("AMZN", 100), row("META", 50)];
    expect(symbols(sortStocks(tied, { key: "price", direction: "desc" }))).toEqual(["AMZN", "NVDA", "META"]);
    expect(symbols(sortStocks(tied, { key: "price", direction: "asc" }))).toEqual(["META", "AMZN", "NVDA"]);
  });

  it("doesn't change the input", () => {
    const before = symbols(stocks);
    sortStocks(stocks, { key: "price", direction: "asc" });
    expect(symbols(stocks)).toEqual(before);
  });
});

describe("nextSort", () => {
  it("flips the direction of the sorted column", () => {
    expect(nextSort({ key: "price", direction: "desc" }, "price")).toEqual({ key: "price", direction: "asc" });
    expect(nextSort({ key: "price", direction: "asc" }, "price")).toEqual({ key: "price", direction: "desc" });
  });

  it("starts a new column in its default direction", () => {
    expect(nextSort({ key: "price", direction: "asc" }, "marketCap")).toEqual({ key: "marketCap", direction: "desc" });
    expect(nextSort({ key: "price", direction: "desc" }, "symbol")).toEqual({ key: "symbol", direction: "asc" });
  });
});

describe("sortStocks with missing values", () => {
  it("puts missing values last in both directions", () => {
    const rows = [
      { symbol: "A", price: 1, changePercent: 0, marketCap: null, peRatio: 10 },
      { symbol: "B", price: 1, changePercent: 0, marketCap: 5, peRatio: null },
      { symbol: "C", price: 1, changePercent: 0, marketCap: 9, peRatio: 20 },
    ];
    expect(symbols(sortStocks(rows, { key: "marketCap", direction: "desc" }))).toEqual(["C", "B", "A"]);
    expect(symbols(sortStocks(rows, { key: "marketCap", direction: "asc" }))).toEqual(["B", "C", "A"]);
    expect(symbols(sortStocks(rows, { key: "peRatio", direction: "asc" }))).toEqual(["A", "C", "B"]);
  });
});
