/**
 * Brings an account up to date with the market: everything that happened at
 * each daily close since it was last processed, in time order.
 *
 * At each close, in this order:
 * 1. Dividends and splits with that ex-date, for the shares held going in
 *    (a short pays the dividend).
 * 2. Open orders, oldest first: fill (at that close), expire, or stay open.
 *    A filled order places its bracket and cancels the rest of its group;
 *    a trailing stop that didn't fill follows the close.
 * 3. Options expiring at that close are settled in cash.
 * 4. Shorts pay their borrow fee, and a margin call buys shorts back if
 *    equity has fallen below the maintenance margin (lib/trading.ts).
 * 5. Alerts that this close sets off.
 *
 * It runs whenever the account is loaded and before every trade, in the
 * browser for guests and on the server (inside the trade's database
 * transaction) for signed-in users. Because it always runs before anything
 * else changes the account, the account's current state *is* its state at
 * the last processed close, so it can simply step forward from there.
 *
 * Running it twice changes nothing the second time: it only looks at closes
 * after `processedThrough`, then moves that forward. So two tabs, or a retry,
 * can't pay a dividend twice.
 */
import { alertTriggers } from "./alerts";
import { optionValue, settleOption } from "./option-trading";
import { bracketOrders, cancelGroup, isOpen, ORDER_MAX_AGE, trailLevel, triggers } from "./orders";
import {
  BORROW_FEE,
  MAINTENANCE_MARGIN,
  MAX_CLOSED_ORDERS,
  MAX_EVENTS,
  placeOrder,
  roundCents,
  type Account,
  type AccountEvent,
  type OptionPosition,
  type PendingOrder,
  type PriceAlert,
} from "./trading";
import type { CorporateAction, PricePoint } from "./types";

export interface MarketData {
  /**
   * Daily closes as traded (not adjusted), by symbol, covering the closes since
   * `processedThrough` (more history is fine).
   */
  raw: Record<string, PricePoint[]>;
  /** Dividends and splits by symbol, over the same period. */
  actions: Record<string, CorporateAction[]>;
  /** The latest close in the data: the account is processed up to here. */
  latest: number;
}

/** Every symbol processing needs prices for: held, an option's stock, in an open order, or in an untriggered price alert. */
export function symbolsToProcess(account: Account): string[] {
  return [
    ...new Set([
      ...account.holdings.map((h) => h.symbol),
      ...(account.options ?? []).map((o) => o.symbol),
      ...(account.orders ?? []).filter(isOpen).map((o) => o.symbol),
      ...(account.alerts ?? []).filter((a) => a.triggeredAt === undefined && !a.condition).map((a) => a.symbol),
    ]),
  ];
}

/** True if there's anything to do: the market has moved past the account. */
export const needsProcessing = (account: Account, latest: number) => account.processedThrough === undefined || account.processedThrough < latest;

const SESSIONS_PER_YEAR = 252;

/**
 * An id for a trade processing makes itself (a margin call's, an expiry's).
 * Trade ids are unique across every account, so they're random, not built
 * from the stock and day, which two accounts could share.
 */
export const tradeId = () => crypto.randomUUID();

/** A split's options cover the new shares: more contracts at a lower strike. A ratio that isn't whole settles them at the close instead. */
function splitOptions(account: Account, symbol: string, ratio: number, close: number | undefined, day: number): Account {
  let current = account;
  for (const o of (account.options ?? []).filter((x) => x.symbol === symbol)) {
    if (Number.isInteger(ratio)) {
      const strike = roundCents(o.strike / ratio);
      const adjusted: OptionPosition = { id: `${symbol}:${o.kind}:${strike}:${o.expiry}`, symbol, kind: o.kind, strike, expiry: o.expiry, contracts: o.contracts * ratio, averagePremium: o.averagePremium / ratio };
      current = { ...current, options: (current.options ?? []).map((x) => (x === o ? adjusted : x)) };
    } else if (close !== undefined) {
      current = settleOption(current, o, close * ratio, day);
    }
  }
  return current;
}

/** One close's borrow fee on each short with a price that day, added to that month's fee for the stock. */
function chargeBorrowFees(account: Account, events: AccountEvent[], closeAt: Map<string, Map<number, number>>, day: number): Account {
  let cash = account.cash;
  for (const h of account.holdings) {
    const close = h.shares < 0 ? closeAt.get(h.symbol)?.get(day) : undefined;
    if (close === undefined) continue;
    const fee = roundCents((-h.shares * close * BORROW_FEE) / SESSIONS_PER_YEAR);
    if (fee <= 0) continue;
    cash = roundCents(cash - fee);
    const month = new Date(day).toISOString().slice(0, 7);
    const id = `borrow-fee:${h.symbol}:${month}`;
    const i = events.findIndex((e) => e.id === id);
    if (i >= 0) events[i] = { ...events[i], time: day, shares: h.shares, cash: roundCents(events[i].cash - fee) };
    else events.unshift({ id, kind: "borrow-fee", symbol: h.symbol, time: day, shares: h.shares, value: BORROW_FEE, cash: -fee });
  }
  return cash === account.cash ? account : { ...account, cash };
}

/** Cash plus every position at `marks` (options at their latest mark, or what they'd settle for). */
export function equityOf(account: Account, marks: Record<string, number>): number {
  const shares = account.holdings.reduce((sum, h) => sum + h.shares * (marks[h.symbol] ?? h.averageCost), 0);
  const options = (account.options ?? []).reduce((sum, o) => {
    const close = marks[o.symbol];
    const each = o.mark ?? (close === undefined ? o.averagePremium : optionValue(o, close));
    return sum + o.contracts * 100 * each;
  }, 0);
  return account.cash + shares + options;
}

/**
 * If equity is below the maintenance margin (30% of the shorts' value), buys
 * shorts back at this close, largest first, until it isn't. Equity doesn't
 * change when a short is bought back, but the requirement shrinks with it.
 * If the cash runs short, stocks owned are sold first.
 */
function marginCall(account: Account, events: AccountEvent[], marks: Record<string, number>, day: number): Account {
  const shortValueAt = (a: Account) => a.holdings.reduce((sum, h) => (h.shares < 0 ? sum - h.shares * (marks[h.symbol] ?? h.averageCost) : sum), 0);
  let current = account;
  let deficit = shortValueAt(current) - equityOf(current, marks) / MAINTENANCE_MARGIN;
  if (deficit <= 0.005) return account;
  const shorts = current.holdings.filter((h) => h.shares < 0 && marks[h.symbol] !== undefined).sort((a, b) => a.shares * marks[a.symbol] - b.shares * marks[b.symbol]);
  for (const short of shorts) {
    if (deficit <= 0.005) break;
    const close = marks[short.symbol];
    let count = Math.min(-short.shares, Math.ceil(deficit / close - 1e-9));
    // Raise the cash by selling stocks owned, largest first.
    for (const long of [...current.holdings].filter((h) => h.shares > 0 && marks[h.symbol] !== undefined).sort((a, b) => b.shares * marks[b.symbol] - a.shares * marks[a.symbol])) {
      if (current.cash >= count * close) break;
      const sold = placeOrder(current, { symbol: long.symbol, side: "sell", shares: long.shares, price: marks[long.symbol], id: tradeId(), time: day, note: "Sold by a margin call, to raise cash to buy back a short." }, marks);
      if (sold.ok) current = sold.account;
    }
    count = Math.min(count, Math.floor(current.cash / close + 1e-9));
    if (count <= 0) continue;
    const covered = placeOrder(current, { symbol: short.symbol, side: "buy", shares: count, price: close, id: tradeId(), time: day, note: "Bought back by a margin call." }, marks);
    if (!covered.ok) continue;
    current = covered.account;
    deficit -= count * close;
    events.unshift({ id: `margin-call:${short.symbol}:${day}`, kind: "margin-call", symbol: short.symbol, time: day, shares: count, value: close, cash: 0 });
  }
  return current;
}

export function processAccount(account: Account, data: MarketData): Account {
  // A brand-new (or pre-Phase 7) account starts being tracked from now: nothing is applied retroactively.
  if (account.processedThrough === undefined) return { ...account, processedThrough: data.latest };
  if (account.processedThrough >= data.latest) return account;
  // Missing prices for a symbol (unavailable right now): wait, rather than step past closes it needed.
  if (symbolsToProcess(account).some((s) => !data.raw[s])) return account;
  const since = account.processedThrough;

  const closeAt = new Map<string, Map<number, number>>();
  const days = new Set<number>();
  for (const [symbol, points] of Object.entries(data.raw)) {
    const map = new Map<number, number>();
    for (const p of points) {
      if (p.time <= since || p.time > data.latest) continue;
      map.set(p.time, p.price);
      days.add(p.time);
    }
    closeAt.set(symbol, map);
  }
  for (const list of Object.values(data.actions)) for (const a of list) if (a.time > since && a.time <= data.latest) days.add(a.time);


  let current: Account = { ...account, events: [...(account.events ?? [])], orders: [...(account.orders ?? [])], alerts: [...(account.alerts ?? [])], ...(account.options && { options: [...account.options] }) };
  const events = current.events as AccountEvent[];
  const updateOrder = (id: string, patch: Partial<PendingOrder>) => {
    current.orders = (current.orders as PendingOrder[]).map((o) => (o.id === id ? { ...o, ...patch } : o));
  };
  // A trade keeps the account's other lists as they are mid-step.
  const keepLists = (next: Account) => ({ ...next, orders: current.orders, events: current.events, alerts: current.alerts });
  // The latest close seen for each symbol, so a day one stock didn't trade still values it.
  const lastClose = new Map<string, number>();

  for (const day of [...days].sort((a, b) => a - b)) {
    for (const [symbol, map] of closeAt) {
      const close = map.get(day);
      if (close !== undefined) lastClose.set(symbol, close);
    }
    const marks = Object.fromEntries(lastClose);

    // 1. Dividends and splits.
    for (const [symbol, list] of Object.entries(data.actions)) {
      for (const action of list) {
        if (action.time !== day) continue;
        const held = current.holdings.find((h) => h.symbol === symbol);
        const id = `${action.kind}:${symbol}:${day}`;
        if (events.some((e) => e.id === id)) continue;
        if (action.kind === "split") current = keepLists(splitOptions(current, symbol, action.ratio, closeAt.get(symbol)?.get(day), day));
        if (!held) continue;
        if (action.kind === "dividend") {
          // A short pays it: its cash is negative.
          const cash = roundCents(held.shares * action.amount);
          current = { ...current, cash: roundCents(current.cash + cash) };
          events.unshift({ id, kind: "dividend", symbol, time: day, shares: held.shares, value: action.amount, cash });
        } else {
          const exact = held.shares * action.ratio;
          // Whole shares, toward zero: a short's fraction is bought back, so its cash is negative.
          const sharesAfter = Math.sign(exact) * Math.floor(Math.abs(exact) + 1e-9);
          // The simulator keeps whole shares, so a fraction is paid out at the day's close ("cash in lieu").
          const close = closeAt.get(symbol)?.get(day);
          const cash = close === undefined ? 0 : roundCents((exact - sharesAfter) * close);
          const holdings =
            sharesAfter !== 0
              ? current.holdings.map((h) => (h === held ? { ...h, shares: sharesAfter, averageCost: h.averageCost / action.ratio } : h))
              : current.holdings.filter((h) => h !== held);
          current = { ...current, cash: roundCents(current.cash + cash), holdings };
          events.unshift({ id, kind: "split", symbol, time: day, shares: held.shares, value: action.ratio, cash, sharesAfter });
          // Old prices no longer mean the same thing: open orders are cancelled, alerts rescaled.
          for (const o of (current.orders as PendingOrder[]).filter((o) => isOpen(o) && o.symbol === symbol)) {
            updateOrder(o.id, { status: "cancelled", closedAt: day, note: `Cancelled because of a ${action.ratio}-for-1 split.` });
          }
          current.alerts = (current.alerts as PriceAlert[]).map((a) =>
            a.symbol === symbol && a.triggeredAt === undefined ? { ...a, price: Math.round((a.price / action.ratio) * 100) / 100 } : a,
          );
        }
      }
    }

    // 2. Orders, oldest first.
    const open = (current.orders as PendingOrder[]).filter((o) => isOpen(o) && o.createdAt < day).sort((a, b) => a.createdAt - b.createdAt);
    for (const order of open) {
      const close = closeAt.get(order.symbol)?.get(day);
      if (close === undefined) continue; // no price for it that day
      // An order cancelled earlier this close (the other side of its bracket filled) is skipped.
      if (!(current.orders as PendingOrder[]).some((o) => o.id === order.id && isOpen(o))) continue;
      if (triggers(order, close)) {
        const result = placeOrder(
          current,
          { symbol: order.symbol, side: order.side, shares: order.shares, price: close, id: order.id, time: day, ...(order.short && { short: true }), reason: order.reason, note: order.tradeNote },
          marks,
        );
        if (result.ok) {
          current = keepLists(result.account);
          updateOrder(order.id, { status: "filled", closedAt: day, fillPrice: close });
          current.orders = [...bracketOrders(order, day), ...cancelGroup(current.orders as PendingOrder[], order, day)];
        } else {
          updateOrder(order.id, { status: "cancelled", closedAt: day, note: `Couldn't fill: ${result.message}` });
        }
      } else if (order.duration === "day" || day - order.createdAt > ORDER_MAX_AGE) {
        updateOrder(order.id, { status: "expired", closedAt: day });
      } else if (order.type === "trailing" && order.trail) {
        // Not set off: the stop follows a new best close, and never moves back.
        const best = order.side === "sell" ? Math.max(order.extreme ?? close, close) : Math.min(order.extreme ?? close, close);
        if (best !== order.extreme) updateOrder(order.id, { extreme: best, price: trailLevel(order.side, order.trail, best) });
      }
    }

    // 3. Options expiring at this close: settled in cash at what they're worth.
    for (const o of [...(current.options ?? [])]) {
      if (o.expiry > day) continue;
      const close = closeAt.get(o.symbol)?.get(day) ?? lastClose.get(o.symbol);
      if (close === undefined) continue;
      current = keepLists(settleOption(current, o, close, day));
      events.unshift({ id: `expiry:${o.id}`, kind: "expiry", symbol: o.symbol, time: day, shares: o.contracts, value: optionValue(o, close), cash: 0 });
    }

    // 4. Borrow fees, then a margin call if equity is too low.
    current = chargeBorrowFees(current, events, closeAt, day);
    current = keepLists(marginCall(current, events, marks, day));

    // 5. Price alerts against the close. Indicator alerts are checked each night by the analytics
    // service (services/analytics/analytics/alerts.py), which writes their triggers itself.
    current.alerts = (current.alerts as PriceAlert[]).map((a) => {
      if (a.condition || a.triggeredAt !== undefined || a.createdAt >= day) return a;
      const close = closeAt.get(a.symbol)?.get(day);
      return close !== undefined && alertTriggers(a, close) ? { ...a, triggeredAt: day, triggerPrice: close } : a;
    });
  }

  // Keep the lists bounded: every open order, then the newest closed ones.
  const orders = current.orders as PendingOrder[];
  const closed = orders.filter((o) => !isOpen(o)).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  return {
    ...current,
    events: events.sort((a, b) => b.time - a.time).slice(0, MAX_EVENTS),
    orders: [...orders.filter(isOpen), ...closed.slice(0, MAX_CLOSED_ORDERS)],
    processedThrough: data.latest,
  };
}
