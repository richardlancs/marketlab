/**
 * The rules for the simulated account: buying, selling and the watchlist.
 *
 * Every function here is pure: it takes an account and returns a new one,
 * without changing the input or touching storage. That's what lets the same
 * rules run on the server (every account, in the database) and in the
 * browser (to show a change at once, before the server confirms it), so the
 * two can never disagree about whether a trade is allowed.
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

/** Something that happened to a holding without a trade: a dividend paid, or a split. */
export interface AccountEvent {
  id: string;
  kind: "dividend" | "split";
  symbol: string;
  /** The close of the ex-date: the event counts from that day. */
  time: number;
  /** Shares held when it happened. */
  shares: number;
  /** Dividend: dollars per share. Split: the ratio (2 = 2-for-1). */
  value: number;
  /** Cash it added: the dividend, or for a split the payout for a fraction of a share. */
  cash: number;
  /** Splits only: shares held afterward. */
  sharesAfter?: number;
}

/** An order that waits for a price: see lib/orders.ts for how it fills. */
export interface PendingOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  /** Limit: at this price or better. Stop: once the price passes this level. */
  type: "limit" | "stop";
  shares: number;
  price: number;
  /** "day": only the next close; "gtc": good till cancelled (up to 90 days). */
  duration: "day" | "gtc";
  createdAt: number;
  status: "open" | "filled" | "cancelled" | "expired";
  /** When it stopped being open, and why (for cancellations). */
  closedAt?: number;
  fillPrice?: number;
  note?: string;
}

/** "Tell me when KO closes above $70." */
/**
 * What an indicator alert watches for, instead of a price (lib/alerts.ts).
 * `direction` on the alert says which way: "above" is RSI rising past the
 * level, the price crossing above its average, a rise of the size, or a new
 * 52-week high; "below" the opposite.
 */
export type AlertCondition =
  | { kind: "rsi"; days: number; level: number }
  | { kind: "sma-cross"; days: number }
  | { kind: "move"; percent: number }
  | { kind: "range-52w" };

export interface PriceAlert {
  id: string;
  symbol: string;
  direction: "above" | "below";
  /** The price to cross; for an indicator alert, the price when it was set. */
  price: number;
  condition?: AlertCondition;
  createdAt: number;
  /** The close it triggered on, once it has. */
  triggeredAt?: number;
  triggerPrice?: number;
  /** True once the user has seen it triggered. */
  seen?: boolean;
}

export interface Account {
  cash: number;
  holdings: Holding[];
  /** Symbols, in the order they were added. */
  watchlist: string[];
  /** Newest first. */
  trades: Trade[];
  // The fields below were added in Phase 7. They're optional, so accounts
  // saved before then still load (and mean "none yet").
  /** Dividends and splits, newest first. */
  events?: AccountEvent[];
  /** Open orders, then recently closed ones (newest first). */
  orders?: PendingOrder[];
  alerts?: PriceAlert[];
  /** The last close the account has been brought up to date with (dividends, splits, fills, alerts). */
  processedThrough?: number;
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

export type TradeError = "invalid-shares" | "invalid-price" | "insufficient-cash" | "insufficient-shares" | "too-many-holdings";

export type TradeResult = { ok: true; account: Account; trade: Trade } | { ok: false; error: TradeError; message: string };

/** The most shares one order can be for. Stops absurd numbers from typos. */
export const MAX_SHARES_PER_ORDER = 1_000_000;

/**
 * The most stocks an account can hold, and watch. Any ticker can be added now,
 * so these keep storage (and, with real prices, data requests) bounded.
 */
export const MAX_HOLDINGS = 30;
export const MAX_WATCHLIST = 30;

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
    if (!held && account.holdings.length >= MAX_HOLDINGS) {
      return fail("too-many-holdings", `You can hold up to ${MAX_HOLDINGS} different stocks. Sell one to make room.`);
    }
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

export const WATCHLIST_FULL = `You can watch up to ${MAX_WATCHLIST} stocks. Remove one to make room.`;

/** True if the symbol can't be added because the watchlist is full. Removing is always allowed. */
export const watchlistIsFull = (account: Account, symbol: string) =>
  !account.watchlist.includes(symbol) && account.watchlist.length >= MAX_WATCHLIST;

/** Adds the symbol to the end of the watchlist, or removes it if it's already there. A full watchlist stays as it is. */
export function toggleWatchlist(account: Account, symbol: string): Account {
  if (watchlistIsFull(account, symbol)) return account;
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
//
// Symbols are checked with `isKnown`. When *reading* saved data, callers only
// check the format (isSymbolFormat): a stock that's missing from the data
// right now (the source changed, Tiingo is down) must never wipe an account.
// Whether a stock really exists is checked when it's *added*, on the server.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isPositiveInt = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

/** The most trades kept in history. Older ones are dropped when loading. */
export const MAX_TRADES = 500;
/** Dividends and splits kept, newest first. */
export const MAX_EVENTS = 200;
/** Open orders at once, and closed ones kept to show what happened to them. */
export const MAX_OPEN_ORDERS = 20;
export const MAX_CLOSED_ORDERS = 50;
export const MAX_ALERTS = 20;

const isTime = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isPrice = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isOptional = <T>(v: unknown, check: (x: unknown) => x is T) => v === undefined || check(v);

function parseEvent(e: unknown, known: (s: unknown) => s is string): AccountEvent | null {
  if (!isRecord(e) || typeof e.id !== "string" || (e.kind !== "dividend" && e.kind !== "split") || !known(e.symbol)) return null;
  if (!isTime(e.time) || !isPositiveInt(e.shares) || !isPrice(e.value) || !isMoney(e.cash)) return null;
  if (e.kind === "split" && !isMoney(e.sharesAfter)) return null;
  return {
    id: e.id,
    kind: e.kind,
    symbol: e.symbol,
    time: e.time,
    shares: e.shares,
    value: e.value,
    cash: e.cash,
    ...(e.kind === "split" && { sharesAfter: e.sharesAfter as number }),
  };
}

/** Checks a stored order (one the user is placing is checked again, more strictly, in lib/orders.ts). */
export function parsePendingOrder(o: unknown, known: (s: unknown) => s is string): PendingOrder | null {
  if (!isRecord(o) || typeof o.id !== "string" || !known(o.symbol)) return null;
  if ((o.side !== "buy" && o.side !== "sell") || (o.type !== "limit" && o.type !== "stop") || (o.duration !== "day" && o.duration !== "gtc")) return null;
  if (!isPositiveInt(o.shares) || !isPrice(o.price) || !isTime(o.createdAt)) return null;
  if (o.status !== "open" && o.status !== "filled" && o.status !== "cancelled" && o.status !== "expired") return null;
  if (!isOptional(o.closedAt, isTime) || !isOptional(o.fillPrice, isPrice) || !isOptional(o.note, (x): x is string => typeof x === "string" && x.length <= 200)) return null;
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    shares: o.shares,
    price: o.price,
    duration: o.duration,
    createdAt: o.createdAt,
    status: o.status,
    ...(o.closedAt !== undefined && { closedAt: o.closedAt as number }),
    ...(o.fillPrice !== undefined && { fillPrice: o.fillPrice as number }),
    ...(o.note !== undefined && { note: o.note as string }),
  };
}

/** An indicator alert's condition, or null if it isn't a valid one. */
export function parseAlertCondition(value: unknown): AlertCondition | null {
  if (!isRecord(value)) return null;
  const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  switch (value.kind) {
    case "rsi":
      return int(value.days, 2, 100) && typeof value.level === "number" && value.level > 0 && value.level < 100 ? { kind: "rsi", days: value.days as number, level: value.level } : null;
    case "sma-cross":
      return int(value.days, 5, 250) ? { kind: "sma-cross", days: value.days as number } : null;
    case "move":
      return typeof value.percent === "number" && value.percent >= 0.5 && value.percent <= 50 ? { kind: "move", percent: value.percent } : null;
    case "range-52w":
      return { kind: "range-52w" };
    default:
      return null;
  }
}

export function parsePriceAlert(a: unknown, known: (s: unknown) => s is string): PriceAlert | null {
  if (!isRecord(a) || typeof a.id !== "string" || !known(a.symbol) || (a.direction !== "above" && a.direction !== "below")) return null;
  if (!isPrice(a.price) || !isTime(a.createdAt) || !isOptional(a.triggeredAt, isTime) || !isOptional(a.triggerPrice, isPrice)) return null;
  if (a.seen !== undefined && typeof a.seen !== "boolean") return null;
  const condition = a.condition === undefined || a.condition === null ? undefined : parseAlertCondition(a.condition);
  if (condition === null) return null;
  return {
    id: a.id,
    symbol: a.symbol,
    direction: a.direction,
    price: a.price,
    ...(condition && { condition }),
    createdAt: a.createdAt,
    ...(a.triggeredAt !== undefined && { triggeredAt: a.triggeredAt as number }),
    ...(a.triggerPrice !== undefined && { triggerPrice: a.triggerPrice as number }),
    ...(a.seen !== undefined && { seen: a.seen as boolean }),
  };
}

/** Parses an optional list: absent is fine (an account from before it existed); present must be all valid. */
function parseList<T>(value: unknown, parse: (item: unknown) => T | null, max: number): T[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const item of value.slice(0, max)) {
    const parsed = parse(item);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

/** Returns a clean Account if `value` is a valid one, with every symbol passing `isKnown`, otherwise null. */
export function parseAccount(value: unknown, isKnown: (symbol: string) => boolean): Account | null {
  if (!isRecord(value) || !isMoney(value.cash)) return null;
  const { holdings, watchlist, trades } = value;
  if (!Array.isArray(holdings) || !Array.isArray(watchlist) || !Array.isArray(trades)) return null;
  const known = (symbol: unknown): symbol is string => typeof symbol === "string" && isKnown(symbol);

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

  const events = parseList(value.events, (e) => parseEvent(e, known), MAX_EVENTS);
  const orders = parseList(value.orders, (o) => parsePendingOrder(o, known), MAX_OPEN_ORDERS + MAX_CLOSED_ORDERS);
  const alerts = parseList(value.alerts, (a) => parsePriceAlert(a, known), MAX_ALERTS);
  if (events === null || orders === null || alerts === null || !isOptional(value.processedThrough, isTime)) return null;

  return {
    cash: value.cash,
    holdings: cleanHoldings,
    watchlist: [...watchlist],
    trades: cleanTrades,
    ...(events && { events }),
    ...(orders && { orders }),
    ...(alerts && { alerts }),
    ...(value.processedThrough !== undefined && { processedThrough: value.processedThrough as number }),
  };
}
