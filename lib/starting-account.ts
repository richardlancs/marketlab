/**
 * What every new account starts with: a few holdings, some cash and a short
 * watchlist. Kept apart from mock-data.ts so browser code can import it
 * without also pulling in the price-history generator.
 */
import type { Account } from "./trading";

/** A fresh copy each time, so nobody can accidentally change the shared default. */
export function startingAccount(): Account {
  return {
    cash: 12_450,
    holdings: [
      { symbol: "AAPL", shares: 40, averageCost: 182.5 },
      { symbol: "MSFT", shares: 15, averageCost: 410 },
      { symbol: "NVDA", shares: 60, averageCost: 118.75 },
      { symbol: "AMZN", shares: 25, averageCost: 178.2 },
      { symbol: "JPM", shares: 20, averageCost: 248.9 },
    ],
    watchlist: ["AAPL", "NVDA", "TSLA", "META", "NFLX"],
    trades: [],
  };
}

/** True if `account` is exactly the starting account: nothing has been changed. */
export function isStartingAccount(account: Account): boolean {
  return JSON.stringify(account) === JSON.stringify(startingAccount());
}
