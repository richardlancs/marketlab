/**
 * Limit and stop orders: orders that wait for a price. Pure functions, used
 * on the server and (for the instant view of a change) in the browser, like
 * lib/trading.ts.
 *
 * Prices here are daily closes, so an order is checked once a day, against
 * each close after the one it was placed at:
 *
 * |      | Limit (at this price or better) | Stop (once the price passes it) |
 * | Buy  | close ≤ limit                   | close ≥ stop                    |
 * | Sell | close ≥ limit                   | close ≤ stop                    |
 *
 * It fills at that close, through the same rules as any trade (placeOrder).
 * The close can be better than a limit, or, after a gap, much worse than a
 * stop: a stop decides *when* to sell, not the price.
 */
import { MAX_OPEN_ORDERS, MAX_SHARES_PER_ORDER, type Account, type PendingOrder } from "./trading";

/** Good-till-cancelled orders expire after this long. */
export const ORDER_MAX_AGE = 90 * 24 * 60 * 60 * 1000;

export interface NewOrder {
  symbol: string;
  side: PendingOrder["side"];
  type: PendingOrder["type"];
  shares: number;
  price: number;
  duration: PendingOrder["duration"];
}

export const isOpen = (order: PendingOrder) => order.status === "open";

/** True if this close sets the order off. */
export function triggers(order: Pick<PendingOrder, "side" | "type" | "price">, close: number): boolean {
  if (order.type === "limit") return order.side === "buy" ? close <= order.price : close >= order.price;
  return order.side === "buy" ? close >= order.price : close <= order.price;
}

/** In plain words, for the trade form and the orders list: "Buy 10 KO if a close is at or below $48.00". */
export function describeOrder(order: NewOrder, formatPrice: (n: number) => string): string {
  const verb = order.side === "buy" ? "Buy" : "Sell";
  // Buy limits and sell stops wait for the price to fall; the other two for it to rise.
  const where = (order.side === "buy") === (order.type === "limit") ? "at or below" : "at or above";
  return `${verb} ${order.shares} ${order.symbol} if a close is ${where} ${formatPrice(order.price)}`;
}

type Placed = { ok: true; account: Account; order: PendingOrder } | { ok: false; message: string };

/**
 * Adds an order, or explains why it can't be placed. Cash and shares are
 * checked now so the order makes sense, and again when it fills: they aren't
 * set aside in between.
 */
export function placePendingOrder(account: Account, input: NewOrder, id: string, now: number): Placed {
  const { symbol, side, type, shares, price, duration } = input;
  if ((side !== "buy" && side !== "sell") || (type !== "limit" && type !== "stop") || (duration !== "day" && duration !== "gtc")) {
    return { ok: false, message: "That order isn't valid." };
  }
  if (!Number.isInteger(shares) || shares <= 0 || shares > MAX_SHARES_PER_ORDER) {
    return { ok: false, message: `Enter a whole number of shares from 1 to ${MAX_SHARES_PER_ORDER.toLocaleString("en-US")}.` };
  }
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) return { ok: false, message: "Enter a price above $0." };
  const open = (account.orders ?? []).filter(isOpen);
  if (open.length >= MAX_OPEN_ORDERS) return { ok: false, message: `You can have up to ${MAX_OPEN_ORDERS} open orders. Cancel one to make room.` };
  if (side === "buy" && shares * price > account.cash) return { ok: false, message: "You don't have enough cash for this order at that price." };
  if (side === "sell") {
    const held = account.holdings.find((h) => h.symbol === symbol)?.shares ?? 0;
    const alreadySelling = open.filter((o) => o.symbol === symbol && o.side === "sell").reduce((n, o) => n + o.shares, 0);
    if (held - alreadySelling < shares) return { ok: false, message: held ? `You only have ${held - alreadySelling} ${symbol} shares not already in a sell order.` : `You don't own any ${symbol}.` };
  }
  const order: PendingOrder = { id, symbol, side, type, shares, price: Math.round(price * 100) / 100, duration, createdAt: now, status: "open" };
  return { ok: true, order, account: { ...account, orders: [order, ...(account.orders ?? [])] } };
}

/** Cancels an open order. Anything else (unknown, already closed) leaves the account as it is. */
export function cancelPendingOrder(account: Account, id: string, now: number): Account {
  if (!(account.orders ?? []).some((o) => o.id === id && isOpen(o))) return account;
  return { ...account, orders: (account.orders ?? []).map((o) => (o.id === id ? { ...o, status: "cancelled" as const, closedAt: now, note: "Cancelled by you." } : o)) };
}
