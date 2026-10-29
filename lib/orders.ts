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
 *
 * A trailing stop is a stop whose level follows the price: a sell's stays a
 * set distance below the highest close since it was placed (a buy's, above
 * the lowest), and never moves back. It protects a position, so a sell needs
 * shares you own and a buy a short to cover.
 *
 * A bracket: an opening order (a buy, or a short sale) can carry a stop-loss
 * and a take-profit. When it fills, they're placed as two orders that cancel
 * each other (one-cancels-other): whichever fills first cancels the other.
 * One close can't set off both, since the stop is below the target (above it
 * for a short).
 */
import { annotation, buyingPower, MAX_OPEN_ORDERS, MAX_SHARES_PER_ORDER, SHORT_MARGIN, type Account, type Bracket, type PendingOrder, type Trail, type TradeReason } from "./trading";

/** Good-till-cancelled orders expire after this long. */
export const ORDER_MAX_AGE = 90 * 24 * 60 * 60 * 1000;

export interface NewOrder {
  symbol: string;
  side: PendingOrder["side"];
  type: PendingOrder["type"];
  shares: number;
  price: number;
  duration: PendingOrder["duration"];
  /** A sell that opens (or adds to) a short. */
  short?: boolean;
  /** Trailing stops: the distance. Their `price` is set from the latest price when placed. */
  trail?: Trail;
  /** A stop-loss and take-profit to place when this opening order fills. */
  bracket?: Bracket;
  /** Why, if the trader said: copied to the trade when it fills. */
  reason?: TradeReason;
  note?: string;
}

export const isOpen = (order: PendingOrder) => order.status === "open";

/** True if this close sets the order off. A trailing stop is a stop at its current level. */
export function triggers(order: Pick<PendingOrder, "side" | "type" | "price">, close: number): boolean {
  if (order.type === "limit") return order.side === "buy" ? close <= order.price : close >= order.price;
  return order.side === "buy" ? close >= order.price : close <= order.price;
}

/** A trailing stop's level, given the best close so far: below it for a sell, above it for a buy. */
export function trailLevel(side: PendingOrder["side"], trail: Trail, extreme: number): number {
  const gap = trail.kind === "percent" ? (extreme * trail.value) / 100 : trail.value;
  return Math.round((side === "sell" ? extreme - gap : extreme + gap) * 100) / 100;
}

/** "5%" or "$2.00". */
export const describeTrail = (trail: Trail, formatPrice: (n: number) => string) => (trail.kind === "percent" ? `${trail.value}%` : formatPrice(trail.value));

/** In plain words, for the trade form and the orders list: "Buy 10 KO if a close is at or below $48.00". */
export function describeOrder(order: NewOrder, formatPrice: (n: number) => string): string {
  const verb = order.side === "buy" ? "Buy" : order.short ? "Sell short" : "Sell";
  let text: string;
  if (order.type === "trailing" && order.trail) {
    text = `${verb} ${order.shares} ${order.symbol} if a close ${order.side === "sell" ? "falls" : "rises"} ${describeTrail(order.trail, formatPrice)} ${order.side === "sell" ? "below its highest" : "above its lowest"} close (now ${formatPrice(order.price)})`;
  } else {
    // Buy limits and sell stops wait for the price to fall; the other two for it to rise.
    const where = (order.side === "buy") === (order.type === "limit") ? "at or below" : "at or above";
    text = `${verb} ${order.shares} ${order.symbol} if a close is ${where} ${formatPrice(order.price)}`;
  }
  return text + describeBracket(order.bracket, formatPrice);
}

/** ", then a stop-loss at $45.00 and a take-profit at $60.00", or "". */
export function describeBracket(bracket: Bracket | undefined, formatPrice: (n: number) => string): string {
  const parts = [bracket?.stop !== undefined && `a stop-loss at ${formatPrice(bracket.stop)}`, bracket?.target !== undefined && `a take-profit at ${formatPrice(bracket.target)}`].filter(Boolean);
  return parts.length ? `, then ${parts.join(" and ")}` : "";
}

/**
 * Checks a bracket for an opening order at about `price`: a long's stop below
 * it and target above it, a short's the other way round. Returns a message,
 * or null if it's fine.
 */
export function bracketProblem(bracket: Bracket | undefined, short: boolean, price: number): string | null {
  if (!bracket) return null;
  const { stop, target } = bracket;
  for (const level of [stop, target]) if (level !== undefined && (!Number.isFinite(level) || level <= 0 || level > 1_000_000)) return "Enter bracket prices above $0.";
  if (stop === undefined && target === undefined) return null;
  if (!short && stop !== undefined && stop >= price) return "The stop-loss must be below the price you're buying at.";
  if (!short && target !== undefined && target <= price) return "The take-profit must be above the price you're buying at.";
  if (short && stop !== undefined && stop <= price) return "A short's stop-loss must be above the price you're selling at.";
  if (short && target !== undefined && target >= price) return "A short's take-profit must be below the price you're selling at.";
  return null;
}

/**
 * The protective orders for an opening order that just filled: a stop and a
 * limit that close it, in one one-cancels-other group named after it.
 */
export function bracketOrders(parent: { id: string; symbol: string; shares: number; short?: boolean; bracket?: Bracket }, time: number): PendingOrder[] {
  const { bracket } = parent;
  if (!bracket) return [];
  const side = parent.short ? "buy" : "sell";
  const base = { symbol: parent.symbol, side, shares: parent.shares, duration: "gtc", createdAt: time, status: "open", ocoGroup: parent.id } as const;
  return [
    ...(bracket.stop !== undefined ? [{ ...base, id: `${parent.id}:stop`, type: "stop" as const, price: round(bracket.stop) }] : []),
    ...(bracket.target !== undefined ? [{ ...base, id: `${parent.id}:target`, type: "limit" as const, price: round(bracket.target) }] : []),
  ];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Shares already promised to open orders on this side of a stock; a one-cancels-other group counts once. */
function promised(open: PendingOrder[], symbol: string, side: PendingOrder["side"]): number {
  const groups = new Map<string, number>();
  for (const o of open) {
    if (o.symbol !== symbol || o.side !== side || o.short) continue;
    const key = o.ocoGroup ?? o.id;
    groups.set(key, Math.max(groups.get(key) ?? 0, o.shares));
  }
  return [...groups.values()].reduce((a, b) => a + b, 0);
}

type Placed = { ok: true; account: Account; order: PendingOrder } | { ok: false; message: string };

/** Checks a trailing stop's distance. */
function trailProblem(trail: Trail | undefined, price: number): string | null {
  if (!trail || (trail.kind !== "percent" && trail.kind !== "amount") || !Number.isFinite(trail.value)) return "Enter how far behind the price the stop follows.";
  if (trail.kind === "percent" && (trail.value < 0.5 || trail.value > 50)) return "Enter a trail from 0.5% to 50%.";
  if (trail.kind === "amount" && (trail.value <= 0 || trail.value >= price)) return "Enter a trail above $0 and below the price.";
  return null;
}

/**
 * Adds an order, or explains why it can't be placed. Cash and shares are
 * checked now so the order makes sense, and again when it fills: they aren't
 * set aside in between. `marketPrice` is the latest price: a trailing stop
 * starts from it.
 */
export function placePendingOrder(account: Account, input: NewOrder, id: string, now: number, marketPrice?: number): Placed {
  const { symbol, side, type, shares, duration } = input;
  const short = side === "sell" && input.short === true;
  if ((side !== "buy" && side !== "sell") || (type !== "limit" && type !== "stop" && type !== "trailing") || (duration !== "day" && duration !== "gtc")) {
    return { ok: false, message: "That order isn't valid." };
  }
  if (!Number.isInteger(shares) || shares <= 0 || shares > MAX_SHARES_PER_ORDER) {
    return { ok: false, message: `Enter a whole number of shares from 1 to ${MAX_SHARES_PER_ORDER.toLocaleString("en-US")}.` };
  }
  let price = input.price;
  let trail: Trail | undefined;
  if (type === "trailing") {
    if (marketPrice === undefined || !(marketPrice > 0)) return { ok: false, message: "This stock has no price to trail right now." };
    const problem = trailProblem(input.trail, marketPrice);
    if (problem) return { ok: false, message: problem };
    trail = { kind: input.trail!.kind, value: input.trail!.value };
    price = trailLevel(side, trail, marketPrice);
    if (input.bracket) return { ok: false, message: "A trailing stop can't carry a bracket." };
  }
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) return { ok: false, message: "Enter a price above $0." };
  const open = (account.orders ?? []).filter(isOpen);
  if (open.length >= MAX_OPEN_ORDERS) return { ok: false, message: `You can have up to ${MAX_OPEN_ORDERS} open orders. Cancel one to make room.` };

  const held = account.holdings.find((h) => h.symbol === symbol)?.shares ?? 0;
  const opening = (side === "buy" && held >= 0) || short;
  if (input.bracket && !opening) return { ok: false, message: "Only an order that opens a position (a buy, or a short sale) can carry a stop-loss and take-profit." };
  const bracketIssue = bracketProblem(input.bracket, short, price);
  if (bracketIssue) return { ok: false, message: bracketIssue };
  if (input.bracket && open.length + 1 + Number(input.bracket.stop !== undefined) + Number(input.bracket.target !== undefined) > MAX_OPEN_ORDERS) {
    return { ok: false, message: `A bracket adds orders, and you can have up to ${MAX_OPEN_ORDERS} open. Cancel one to make room.` };
  }

  if (type === "trailing" && side === "sell" && (held <= 0 || short)) return { ok: false, message: `A trailing stop protects a position: you don't own any ${symbol} to sell.` };
  if (type === "trailing" && side === "buy" && held >= 0) return { ok: false, message: `A trailing buy stop covers a short, and you aren't short ${symbol}.` };

  if (side === "buy" && held < 0) {
    const covering = promised(open, symbol, "buy");
    if (-held - covering < shares) return { ok: false, message: `You're short ${-held} ${symbol}${covering ? `, ${covering} already in buy orders` : ""}: an order to cover can be for up to ${Math.max(0, -held - covering)}.` };
  } else if (side === "buy" && shares * price > buyingPower(account)) {
    return { ok: false, message: buyingPower(account) < account.cash ? "You don't have enough buying power for this order at that price: some cash is set aside for your shorts or puts." : "You don't have enough cash for this order at that price." };
  }
  if (short) {
    if (held > 0) return { ok: false, message: `You own ${held} ${symbol}. Sell those first, then sell short.` };
    if (buyingPower(account) < shares * price * (SHORT_MARGIN - 1)) return { ok: false, message: "You don't have enough buying power to set aside for this short sale." };
  } else if (side === "sell") {
    if (held < 0) return { ok: false, message: `You're short ${symbol}: to add to it, choose "Sell short".` };
    const free = held - promised(open, symbol, "sell");
    if (free < shares) return { ok: false, message: held ? `You only have ${free} ${symbol} shares not already in a sell order.` : `You don't own any ${symbol}.` };
  }
  const { reason, note: tradeNote } = annotation(input.reason, input.note);
  const bracket = input.bracket && (input.bracket.stop !== undefined || input.bracket.target !== undefined) ? { ...(input.bracket.stop !== undefined && { stop: round(input.bracket.stop) }), ...(input.bracket.target !== undefined && { target: round(input.bracket.target) }) } : undefined;
  const order: PendingOrder = {
    id,
    symbol,
    side,
    type,
    shares,
    price: round(price),
    duration,
    createdAt: now,
    status: "open",
    ...(short && { short }),
    ...(trail && { trail, extreme: marketPrice }),
    ...(bracket && { bracket }),
    ...(reason && { reason }),
    ...(tradeNote && { tradeNote }),
  };
  return { ok: true, order, account: { ...account, orders: [order, ...(account.orders ?? [])] } };
}

/** Cancels an open order. Anything else (unknown, already closed) leaves the account as it is. */
export function cancelPendingOrder(account: Account, id: string, now: number): Account {
  if (!(account.orders ?? []).some((o) => o.id === id && isOpen(o))) return account;
  return { ...account, orders: (account.orders ?? []).map((o) => (o.id === id ? { ...o, status: "cancelled" as const, closedAt: now, note: "Cancelled by you." } : o)) };
}

/** Cancels the rest of a one-cancels-other group once one of its orders has filled. */
export function cancelGroup(orders: PendingOrder[], filled: PendingOrder, time: number): PendingOrder[] {
  if (!filled.ocoGroup) return orders;
  return orders.map((o) =>
    o.id !== filled.id && o.ocoGroup === filled.ocoGroup && isOpen(o) ? { ...o, status: "cancelled" as const, closedAt: time, note: "Cancelled: the other order in its bracket filled." } : o,
  );
}
