/**
 * What an account starts with. Kept apart from the market data so browser
 * code can import it without also pulling in the price-history generator.
 *
 * A fixed list of presets, not a free amount: a reset is a public Server
 * Action, and a list means nobody can POST themselves a billion dollars.
 */
import type { Account } from "./trading";

export const STARTING_PRESETS = {
  starter: "Starter portfolio: $12,450 cash and 5 stocks",
  cash10k: "Cash only: $10,000",
  cash25k: "Cash only: $25,000",
  cash100k: "Cash only: $100,000",
} as const;

export type StartingPreset = keyof typeof STARTING_PRESETS;

export const isStartingPreset = (value: unknown): value is StartingPreset => typeof value === "string" && Object.hasOwn(STARTING_PRESETS, value);

const CASH: Record<Exclude<StartingPreset, "starter">, number> = { cash10k: 10_000, cash25k: 25_000, cash100k: 100_000 };

/** A fresh copy each time, so nobody can accidentally change the shared default. */
export function startingAccount(preset: StartingPreset = "starter"): Account {
  if (preset !== "starter") return { cash: CASH[preset], holdings: [], watchlist: ["AAPL", "NVDA", "TSLA", "META", "NFLX"], trades: [] };
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

/**
 * True if `account` is exactly one of the starting accounts: nothing has been
 * changed. Bookkeeping (when it was last brought up to date) doesn't count,
 * but anything that happened to it (orders, alerts, dividends) does.
 */
export function isStartingAccount(account: Account): boolean {
  const { cash, holdings, watchlist, trades, events, orders, alerts } = account;
  if (events?.length || orders?.length || alerts?.length) return false;
  const core = JSON.stringify({ cash, holdings, watchlist, trades });
  return (Object.keys(STARTING_PRESETS) as StartingPreset[]).some((preset) => JSON.stringify(startingAccount(preset)) === core);
}
