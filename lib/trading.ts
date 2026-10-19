/**
 * The rules for the simulated account: buying, selling and the watchlist.
 *
 * Every function here is pure: it takes an account and returns a new one,
 * without changing the input or touching storage. That's what lets the same
 * rules run in the browser (guest mode, saved in localStorage) and on the
 * server (signed-in users, saved in the database), so the two can never
 * disagree about whether a trade is allowed.
 */
import type { Holding } from "./types";

export interface Trade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  /** Whole shares only, to keep the simulator simple. */
  shares: number;
  /** The price per share the trade was filled at. */
  price: number;
  /** Unix timestamp in milliseconds. */
  time: number;
  /** For sells: profit or loss against the average cost. Absent for buys. */
  realizedGain?: number;
}

export interface Account {
  cash: number;
  holdings: Holding[];
  /** Symbols, in the order they were added. */
  watchlist: string[];
  /** Newest first. */
  trades: Trade[];
}

export interface Order {
  symbol: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  /** Supplied by the caller, so this function stays pure (no random IDs or clock reads). */
  id: string;
  time: number;
}

export type TradeError = "invalid-shares" | "invalid-price" | "insufficient-cash" | "insufficient-shares";

export type TradeResult = { ok: true; account: Account; trade: Trade } | { ok: false; error: TradeError; message: string };

/** The most shares one order can be for. Stops absurd numbers from typos. */
export const MAX_SHARES_PER_ORDER = 1_000_000;

/** Rounds to whole cents. Applied to cash after every trade. */
export const roundCents = (value: number) => Math.round(value * 100) / 100;

const fail = (error: TradeError, message: string): TradeResult => ({ ok: false, error, message });

/** Fills an order at its price, or explains why it can't be filled. */
export function placeOrder(account: Account, order: Order): TradeResult {
  const { symbol, side, shares, price } = order;
  if (!Number.isInteger(shares) || shares <= 0 || shares > MAX_SHARES_PER_ORDER) {
    return fail("invalid-shares", `Enter a whole number of shares from 1 to ${MAX_SHARES_PER_ORDER.toLocaleString("en-US")}.`);
  }
  if (!Number.isFinite(price) || price <= 0) return fail("invalid-price", "This stock has no valid price.");

  const total = roundCents(shares * price);
  const held = account.holdings.find((h) => h.symbol === symbol);

  if (side === "buy") {
    if (total > account.cash) return fail("insufficient-cash", "You don't have enough cash for this order.");
    const holdings = held
      ? account.holdings.map((h) =>
          h === held
            ? // The new average cost weighs the old shares and the new ones by count.
              { ...h, shares: h.shares + shares, averageCost: (h.shares * h.averageCost + total) / (h.shares + shares) }
            : h,
        )
      : [...account.holdings, { symbol, shares, averageCost: price }];
    const trade: Trade = { id: order.id, symbol, side, shares, price, time: order.time };
    return { ok: true, trade, account: { ...account, cash: roundCents(account.cash - total), holdings, trades: [trade, ...account.trades] } };
  }

  if (!held || held.shares < shares) {
    return fail("insufficient-shares", held ? `You only own ${held.shares} shares of ${symbol}.` : `You don't own any ${symbol}.`);
  }
  // Selling doesn't change the average cost of the shares that are left.
  const holdings =
    held.shares === shares
      ? account.holdings.filter((h) => h !== held)
      : account.holdings.map((h) => (h === held ? { ...h, shares: h.shares - shares } : h));
  const realizedGain = roundCents(total - shares * held.averageCost);
  const trade: Trade = { id: order.id, symbol, side, shares, price, time: order.time, realizedGain };
  return { ok: true, trade, account: { ...account, cash: roundCents(account.cash + total), holdings, trades: [trade, ...account.trades] } };
}

/** Adds the symbol to the end of the watchlist, or removes it if it's already there. */
export function toggleWatchlist(account: Account, symbol: string): Account {
  const watchlist = account.watchlist.includes(symbol)
    ? account.watchlist.filter((s) => s !== symbol)
    : [...account.watchlist, symbol];
  return { ...account, watchlist };
}

/** Total profit or loss locked in by sells so far. */
export function totalRealizedGain(account: Account): number {
  return roundCents(account.trades.reduce((sum, t) => sum + (t.realizedGain ?? 0), 0));
}

// ---------------------------------------------------------------------------
// Validation for account data from outside: localStorage, or a guest account
// being imported into a signed-in one. Anything malformed is rejected rather
// than trusted, so a hand-edited or outdated value can't break the app.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isPositiveInt = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

/** The most trades kept in history. Older ones are dropped when loading. */
export const MAX_TRADES = 500;

/** Returns a clean Account if `value` is a valid one for these symbols, otherwise null. */
export function parseAccount(value: unknown, knownSymbols: readonly string[]): Account | null {
  if (!isRecord(value) || !isMoney(value.cash)) return null;
  const { holdings, watchlist, trades } = value;
  if (!Array.isArray(holdings) || !Array.isArray(watchlist) || !Array.isArray(trades)) return null;
  const known = (symbol: unknown): symbol is string => typeof symbol === "string" && knownSymbols.includes(symbol);

  const cleanHoldings: Holding[] = [];
  for (const h of holdings) {
    if (!isRecord(h) || !known(h.symbol) || !isPositiveInt(h.shares) || !isMoney(h.averageCost)) return null;
    if (cleanHoldings.some((c) => c.symbol === h.symbol)) return null; // one holding per symbol
    cleanHoldings.push({ symbol: h.symbol, shares: h.shares, averageCost: h.averageCost });
  }

  if (!watchlist.every(known) || new Set(watchlist).size !== watchlist.length) return null;

  const cleanTrades: Trade[] = [];
  for (const t of trades.slice(0, MAX_TRADES)) {
    if (!isRecord(t) || typeof t.id !== "string" || !known(t.symbol) || (t.side !== "buy" && t.side !== "sell")) return null;
    if (!isPositiveInt(t.shares) || !isMoney(t.price) || !isMoney(t.time)) return null;
    if (t.realizedGain !== undefined && !(typeof t.realizedGain === "number" && Number.isFinite(t.realizedGain))) return null;
    cleanTrades.push({
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      shares: t.shares,
      price: t.price,
      time: t.time,
      ...(t.realizedGain !== undefined && { realizedGain: t.realizedGain }),
    });
  }

  return { cash: value.cash, holdings: cleanHoldings, watchlist: [...watchlist], trades: cleanTrades };
}
