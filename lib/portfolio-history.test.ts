import { describe, expect, it } from "vitest";
import { firstTradeTime, rebase, relevantSymbols } from "./portfolio-history";
import type { Account } from "./trading";

// The history itself is calculated by the analytics service, and checked there
// (services/analytics/tests/test_performance.py) against accounts made by this
// app's trading code.

const start: Account = { cash: 1000, holdings: [{ symbol: "A", shares: 10, averageCost: 9 }], watchlist: [], trades: [] };
const trade = (time: number, symbol: string, side: "buy" | "sell") => ({ id: `${time}`, time, symbol, side, shares: 1, price: 10 });

describe("portfolio history helpers", () => {
  it("lists the symbols to load and the first trade", () => {
    const account: Account = { ...start, trades: [trade(3, "B", "sell"), trade(2, "B", "buy")] };
    expect(relevantSymbols(account)).toEqual(["A", "B"]);
    expect(firstTradeTime(account)).toBe(2);
    expect(firstTradeTime(start)).toBeNull();
  });

  it("rebases a series to start at 100", () => {
    expect(rebase([50, 75, 25])).toEqual([100, 150, 50]);
  });
});
