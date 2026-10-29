/**
 * The rules for the simulated account: buying, selling (and selling short)
 * and the watchlist. Options are in lib/option-trading.ts.
 *
 * Every function here is pure: it takes an account and returns a new one,
 * without changing the input or touching storage. That's what lets the same
 * rules run on the server (every account, in the database) and in the
 * browser (to show a change at once, before the server confirms it), so the
 * two can never disagree about whether a trade is allowed.
 */
import type { Holding } from "./types";

/** Why a trade was made, if the trader said (trade notes; the Review tab groups round trips by it). */
export const TRADE_REASONS = ["value", "momentum", "news", "dip", "rebalance", "other"] as const;
export type TradeReason = (typeof TRADE_REASONS)[number];
export const isTradeReason = (v: unknown): v is TradeReason => typeof v === "string" && (TRADE_REASONS as readonly string[]).includes(v);
/** The reasons' names, and the Review tab's name for trades without one. */
export const REASON_NAMES: Record<TradeReason | "none", string> = {
  value: "Good value",
  momentum: "Momentum",
  news: "News",
  dip: "Buying the dip",
  rebalance: "Rebalancing",
  other: "Other",
  none: "No reason given",
};

/** The longest trade note kept. */
export const NOTE_LENGTH = 280;

export interface Trade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  /** Whole shares only, to keep the simulator simple. For an option, contracts. */
  shares: number;
  /** The price per share the trade was filled at. For an option, the premium per share (a contract is 100 shares). */
  price: number;
  /** Unix timestamp in milliseconds. */
  time: number;
  /** For trades that close a position (a sale, a buy to cover, closing an option): profit or loss against the average cost. */
  realizedGain?: number;
  /** An option trade: which contract. Absent for shares. */
  option?: OptionContract;
  /** The trader's own reason and note, if they gave them. Private: never shown on public pages. */
  reason?: TradeReason;
  note?: string;
}

/**
 * Something that happened to the account without a trade of its own: a
 * dividend, a split, a short's borrow fee, a margin call (its buy-back is a
 * trade too), or an option expiring.
 */
export interface AccountEvent {
  id: string;
  kind: "dividend" | "split" | "borrow-fee" | "margin-call" | "expiry";
  symbol: string;
  /** The close it happened at (a borrow fee: the latest close charged that month). */
  time: number;
  /** Shares held when it happened (negative for a short); a margin call: shares bought back; an expiry: contracts. */
  shares: number;
  /** Dividend: dollars per share. Split: the ratio (2 = 2-for-1). Borrow fee: the yearly rate. Margin call: the close. Expiry: what each share of the option was worth. */
  value: number;
  /** Cash it changed the account by: negative when paid (a short's dividend, a fee, a written option settling). A margin call's is 0: its trade carries the cash. */
  cash: number;
  /** Splits only: shares held afterward. */
  sharesAfter?: number;
}

/** An order that waits for a price: see lib/orders.ts for how it fills. */
export interface PendingOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  /** Limit: at this price or better. Stop: once the price passes this level. Trailing: a stop that follows the price. */
  type: "limit" | "stop" | "trailing";
  shares: number;
  /** A trailing stop's current level, moved at each close. */
  price: number;
  /** A sell that opens (or adds to) a short position. */
  short?: boolean;
  /** Trailing stops: how far behind the best close the stop follows. */
  trail?: Trail;
  /** Trailing stops: the best close so far (highest for a sell, lowest for a buy). */
  extreme?: number;
  /** An opening order's protective orders, placed when it fills: a stop-loss and a take-profit. */
  bracket?: Bracket;
  /** Orders that cancel each other: when one fills, the others in the group are cancelled. */
  ocoGroup?: string;
  /** "day": only the next close; "gtc": good till cancelled (up to 90 days). */
  duration: "day" | "gtc";
  createdAt: number;
  status: "open" | "filled" | "cancelled" | "expired";
  /** When it stopped being open, and why (for cancellations). */
  closedAt?: number;
  fillPrice?: number;
  note?: string;
  /** The trader's reason and note for the trade, copied to it when the order fills. */
  reason?: TradeReason;
  tradeNote?: string;
}

export interface Trail {
  kind: "percent" | "amount";
  /** Percent (5 = 5%) or dollars. */
  value: number;
}

export interface Bracket {
  /** The stop-loss level. */
  stop?: number;
  /** The take-profit level. */
  target?: number;
}

/** An option contract: European, 100 shares, settled in cash at expiry (lib/option-trading.ts). */
export interface OptionContract {
  kind: "call" | "put";
  strike: number;
  /** The expiry day's close (ms). */
  expiry: number;
}

/** An option position. Written (sold) options have negative contracts. */
export interface OptionPosition extends OptionContract {
  /** `${symbol}:${kind}:${strike}:${expiry}`: one position per contract. */
  id: string;
  symbol: string;
  contracts: number;
  /** The average premium per share paid (or, for written options, received). */
  averagePremium: number;
  /** Its value per share at the latest close, from the analytics service, and when. */
  mark?: number;
  markedAt?: number;
  /** Delta per share at the mark. */
  delta?: number;
}

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
  /** Option positions (Phase 19). */
  options?: OptionPosition[];
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
  /** A sell that opens (or adds to) a short position. Without it, a sale needs shares you own. */
  short?: boolean;
  /** Why, if the trader said: kept on the trade. */
  reason?: TradeReason;
  note?: string;
}

/** The reason and note as a trade keeps them: only the ones given, a note trimmed. */
export function annotation(reason: TradeReason | undefined, note: string | undefined): Pick<Trade, "reason" | "note"> {
  const text = note?.trim();
  return { ...(reason && { reason }), ...(text && { note: text.slice(0, NOTE_LENGTH) }) };
}

/** Sets (or clears, with undefined) a past trade's reason and note. An unknown trade leaves the account as it is. */
export function annotateTrade(account: Account, id: string, reason: TradeReason | undefined, note: string | undefined): Account {
  if (!account.trades.some((t) => t.id === id)) return account;
  return {
    ...account,
    trades: account.trades.map((t) => {
      if (t.id !== id) return t;
      const { reason: _r, note: _n, ...rest } = t;
      void _r;
      void _n;
      return { ...rest, ...annotation(reason, note) };
    }),
  };
}

export type TradeError = "invalid-shares" | "invalid-price" | "insufficient-cash" | "insufficient-shares" | "too-many-holdings" | "short-position" | "long-position";

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

// ---------------------------------------------------------------------------
// Short selling and margin, kept simple (Reg T-like):
// - A short sale's proceeds go into cash, but 150% of every short's value at
//   the latest price is set aside, so it can't be spent: the proceeds plus
//   half as much again.
// - Each close, a short pays a borrow fee (3% a year) and any dividend.
// - If equity (cash + longs − shorts) falls below 30% of the shorts' value at
//   a close, shorts are bought back at that close until it's restored
//   (a margin call; lib/processing.ts).
// Written options set aside what they could cost: a covered call its 100
// shares a contract, a cash-secured put its strike × 100 in cash.
// ---------------------------------------------------------------------------

export const SHORT_MARGIN = 1.5;
export const MAINTENANCE_MARGIN = 0.3;
export const BORROW_FEE = 0.03;

/** Latest prices by symbol, where known. Positions without one are valued at their average cost. */
export type Marks = Record<string, number>;

const markOf = (h: Holding, marks: Marks | undefined) => marks?.[h.symbol] ?? h.averageCost;

/** What the short positions are worth at `marks` (a positive number). */
export const shortValue = (account: Pick<Account, "holdings">, marks?: Marks) =>
  account.holdings.reduce((sum, h) => (h.shares < 0 ? sum - h.shares * markOf(h, marks) : sum), 0);

/** Cash set aside for cash-secured puts. */
export const putReserve = (account: Pick<Account, "options">) =>
  (account.options ?? []).reduce((sum, o) => (o.kind === "put" && o.contracts < 0 ? sum - o.contracts * 100 * o.strike : sum), 0);

/** Shares of `symbol` set aside for covered calls. */
export const callReserve = (account: Pick<Account, "options">, symbol: string) =>
  (account.options ?? []).reduce((sum, o) => (o.symbol === symbol && o.kind === "call" && o.contracts < 0 ? sum - o.contracts * 100 : sum), 0);

/** Cash free to spend: cash, less what shorts and secured puts set aside. */
export const buyingPower = (account: Pick<Account, "cash" | "holdings" | "options">, marks?: Marks) =>
  roundCents(account.cash - SHORT_MARGIN * shortValue(account, marks) - putReserve(account));

/** Fills an order at its price, or explains why it can't be filled. `marks` values any short positions (default: their average cost). */
export function placeOrder(account: Account, order: Order, marks?: Marks): TradeResult {
  const { symbol, side, shares, price } = order;
  if (!Number.isInteger(shares) || shares <= 0 || shares > MAX_SHARES_PER_ORDER) {
    return fail("invalid-shares", `Enter a whole number of shares from 1 to ${MAX_SHARES_PER_ORDER.toLocaleString("en-US")}.`);
  }
  if (!Number.isFinite(price) || price <= 0) return fail("invalid-price", "This stock has no valid price.");

  const total = roundCents(shares * price);
  const held = account.holdings.find((h) => h.symbol === symbol);
  const prices = { ...marks, [symbol]: price };
  const record = (realizedGain?: number): Trade => ({
    id: order.id,
    symbol,
    side,
    shares,
    price,
    time: order.time,
    ...(realizedGain !== undefined && { realizedGain }),
    ...annotation(order.reason, order.note),
  });

  if (side === "buy" && held && held.shares < 0) {
    // Buying to cover a short: the shares bought back close it, at a gain if the price fell.
    if (shares > -held.shares) {
      return fail("short-position", `You're short ${-held.shares} ${symbol}: buy up to ${-held.shares} to cover, then buy again.`);
    }
    if (total > account.cash) return fail("insufficient-cash", "You don't have enough cash to buy these shares back.");
    const holdings = held.shares + shares === 0 ? account.holdings.filter((h) => h !== held) : account.holdings.map((h) => (h === held ? { ...h, shares: h.shares + shares } : h));
    const trade = record(roundCents(shares * held.averageCost - total));
    return { ok: true, trade, account: { ...account, cash: roundCents(account.cash - total), holdings, trades: [trade, ...account.trades] } };
  }

  if (side === "buy") {
    if (total > buyingPower(account, prices)) {
      return fail("insufficient-cash", shortValue(account) > 0 || putReserve(account) > 0 ? "You don't have enough buying power for this order: some cash is set aside for your shorts or puts." : "You don't have enough cash for this order.");
    }
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
    const trade = record();
    return { ok: true, trade, account: { ...account, cash: roundCents(account.cash - total), holdings, trades: [trade, ...account.trades] } };
  }

  if (order.short) {
    // Selling short: borrowed shares sold now, to be bought back later.
    if (held && held.shares > 0) return fail("long-position", `You own ${held.shares} ${symbol}. Sell those first, then sell short.`);
    if (!held && account.holdings.length >= MAX_HOLDINGS) {
      return fail("too-many-holdings", `You can hold up to ${MAX_HOLDINGS} different stocks. Close one to make room.`);
    }
    const holdings = held
      ? account.holdings.map((h) => (h === held ? { ...h, shares: h.shares - shares, averageCost: (-h.shares * h.averageCost + total) / (-h.shares + shares) } : h))
      : [...account.holdings, { symbol, shares: -shares, averageCost: price }];
    const after = { ...account, cash: roundCents(account.cash + total), holdings };
    if (buyingPower(after, prices) < 0) {
      return fail("insufficient-cash", `Selling short needs ${formatMoney(roundCents(total * (SHORT_MARGIN - 1)))} of buying power set aside beyond the proceeds, and you don't have enough.`);
    }
    const trade = record();
    return { ok: true, trade, account: { ...after, trades: [trade, ...account.trades] } };
  }

  if (held && held.shares < 0) return fail("short-position", `You're short ${symbol}. Buy to cover it instead.`);
  const free = (held?.shares ?? 0) - callReserve(account, symbol);
  if (!held || free < shares) {
    if (held && held.shares >= shares) return fail("insufficient-shares", `${held.shares - free} of your ${symbol} shares cover calls you wrote, so you can sell ${Math.max(0, free)}.`);
    return fail("insufficient-shares", held ? `You only own ${held.shares} shares of ${symbol}.` : `You don't own any ${symbol}.`);
  }
  // Selling doesn't change the average cost of the shares that are left.
  const holdings =
    held.shares === shares
      ? account.holdings.filter((h) => h !== held)
      : account.holdings.map((h) => (h === held ? { ...h, shares: h.shares - shares } : h));
  const trade = record(roundCents(total - shares * held.averageCost));
  return { ok: true, trade, account: { ...account, cash: roundCents(account.cash + total), holdings, trades: [trade, ...account.trades] } };
}

/** "$1,234.50", without importing the browser formatting code here. */
const formatMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
/** A trade note: some text, at most NOTE_LENGTH characters. */
export const isNote = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= NOTE_LENGTH;

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
  if (!isOptional(o.reason, isTradeReason) || !isOptional(o.tradeNote, isNote)) return null;
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
    ...(o.reason !== undefined && { reason: o.reason as TradeReason }),
    ...(o.tradeNote !== undefined && { tradeNote: o.tradeNote as string }),
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
    if (!isOptional(t.reason, isTradeReason) || !isOptional(t.note, isNote)) return null;
    cleanTrades.push({
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      shares: t.shares,
      price: t.price,
      time: t.time,
      ...(t.realizedGain !== undefined && { realizedGain: t.realizedGain }),
      ...(t.reason !== undefined && { reason: t.reason }),
      ...(t.note !== undefined && { note: t.note }),
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
