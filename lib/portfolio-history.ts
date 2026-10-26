/**
 * Helpers around the simulated portfolio's history. The history itself (each
 * day's value, rebuilt backward from the trades) is calculated by the
 * analytics service: services/analytics/analytics/performance.py.
 */
import type { Account } from "./trading";

/** Every stock the account holds now or has traded: what the history needs prices for. */
export function relevantSymbols(account: Account): string[] {
  return [...new Set([...account.holdings.map((h) => h.symbol), ...account.trades.map((t) => t.symbol)])];
}

/** When the oldest kept trade was made, or null if there are none. */
export const firstTradeTime = (account: Account): number | null =>
  account.trades.length ? Math.min(...account.trades.map((t) => t.time)) : null;

/** Rescales a series so it starts at `base` (e.g. growth of $100), to compare lines of different sizes on one axis. */
export function rebase(values: number[], base = 100): number[] {
  const first = values[0];
  return first ? values.map((v) => (v / first) * base) : values.map(() => base);
}
