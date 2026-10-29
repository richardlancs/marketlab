/**
 * Helpers around the simulated portfolio's history. The history itself (each
 * day's value, rebuilt backward from the trades) is calculated by the
 * analytics service: services/analytics/analytics/performance.py.
 */
import type { Account } from "./trading";

/** Every stock the account holds now (or has options on) or has traded: what the history needs prices for. */
export function relevantSymbols(account: Account): string[] {
  return [...new Set([...account.holdings.map((h) => h.symbol), ...(account.options ?? []).map((o) => o.symbol), ...account.trades.map((t) => t.symbol)])];
}

/**
 * The account as the analytics service takes it (services/analytics/analytics/api.py AccountIn):
 * its cash, holdings (negative for shorts), trades (an option's with its contract), events and option positions.
 */
export function analyticsAccount(account: Account) {
  return {
    cash: account.cash,
    holdings: account.holdings.map(({ symbol, shares, averageCost }) => ({ symbol, shares, averageCost })),
    trades: account.trades.map(({ id, time, symbol, side, shares, price, realizedGain, reason, option }) => ({ id, time, symbol, side, shares, price, realizedGain: realizedGain ?? null, reason: reason ?? null, option: option ?? null })),
    events: (account.events ?? []).map(({ time, kind, symbol, shares, cash, sharesAfter }) => ({ time, kind, symbol, shares, cash, sharesAfter: sharesAfter ?? null })),
    options: (account.options ?? []).map(({ symbol, kind, strike, expiry, contracts, averagePremium, mark }) => ({ symbol, kind, strike, expiry, contracts, averagePremium, mark: mark ?? null })),
  };
}

/** The ids of sales a stop-loss or trailing stop filled, for the review's "your stops". */
export const stopFills = (account: Account) => (account.orders ?? []).filter((o) => o.status === "filled" && o.side === "sell" && (o.type === "stop" || o.type === "trailing")).map((o) => o.id);

/** When the oldest kept trade was made, or null if there are none. */
export const firstTradeTime = (account: Account): number | null =>
  account.trades.length ? Math.min(...account.trades.map((t) => t.time)) : null;

/** Rescales a series so it starts at `base` (e.g. growth of $100), to compare lines of different sizes on one axis. */
export function rebase(values: number[], base = 100): number[] {
  const first = values[0];
  return first ? values.map((v) => (v / first) * base) : values.map(() => base);
}
