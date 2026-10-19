/**
 * Brings an account up to date with the market: everything that happened at
 * each daily close since it was last processed, in time order.
 *
 * At each close, in this order:
 * 1. Dividends and splits with that ex-date, for the shares held going in.
 * 2. Open orders, oldest first: fill (at that close), expire, or stay open.
 * 3. Alerts that this close sets off.
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
import { isOpen, ORDER_MAX_AGE, triggers } from "./orders";
import {
  MAX_CLOSED_ORDERS,
  MAX_EVENTS,
  placeOrder,
  roundCents,
  type Account,
  type AccountEvent,
  type PendingOrder,
  type PriceAlert,
} from "./trading";
import type { CorporateAction, PricePoint } from "./types";

export interface MarketData {
  /** Daily closes as traded (not adjusted), by symbol, covering the closes since `processedThrough`. */
  raw: Record<string, PricePoint[]>;
  /** Dividends and splits by symbol, over the same period. */
  actions: Record<string, CorporateAction[]>;
  /** The latest close in the data: the account is processed up to here. */
  latest: number;
}

/** Every symbol processing needs prices for: held, in an open order, or in an untriggered alert. */
export function symbolsToProcess(account: Account): string[] {
  return [
    ...new Set([
      ...account.holdings.map((h) => h.symbol),
      ...(account.orders ?? []).filter(isOpen).map((o) => o.symbol),
      ...(account.alerts ?? []).filter((a) => a.triggeredAt === undefined).map((a) => a.symbol),
    ]),
  ];
}

/** True if there's anything to do: the market has moved past the account. */
export const needsProcessing = (account: Account, latest: number) => account.processedThrough === undefined || account.processedThrough < latest;

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

  let current: Account = { ...account, events: [...(account.events ?? [])], orders: [...(account.orders ?? [])], alerts: [...(account.alerts ?? [])] };
  const events = current.events as AccountEvent[];
  const updateOrder = (id: string, patch: Partial<PendingOrder>) => {
    current.orders = (current.orders as PendingOrder[]).map((o) => (o.id === id ? { ...o, ...patch } : o));
  };

  for (const day of [...days].sort((a, b) => a - b)) {
    // 1. Dividends and splits.
    for (const [symbol, list] of Object.entries(data.actions)) {
      for (const action of list) {
        if (action.time !== day) continue;
        const held = current.holdings.find((h) => h.symbol === symbol);
        if (!held) continue;
        const id = `${action.kind}:${symbol}:${day}`;
        if (events.some((e) => e.id === id)) continue;
        if (action.kind === "dividend") {
          const cash = roundCents(held.shares * action.amount);
          current = { ...current, cash: roundCents(current.cash + cash) };
          events.unshift({ id, kind: "dividend", symbol, time: day, shares: held.shares, value: action.amount, cash });
        } else {
          const exact = held.shares * action.ratio;
          const sharesAfter = Math.floor(exact + 1e-9);
          // The simulator keeps whole shares, so a fraction is paid out at the day's close ("cash in lieu").
          const close = closeAt.get(symbol)?.get(day);
          const cash = close === undefined ? 0 : roundCents((exact - sharesAfter) * close);
          const holdings =
            sharesAfter > 0
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
      if (triggers(order, close)) {
        const result = placeOrder(current, { symbol: order.symbol, side: order.side, shares: order.shares, price: close, id: order.id, time: day });
        if (result.ok) {
          current = { ...result.account, orders: current.orders, events: current.events, alerts: current.alerts };
          updateOrder(order.id, { status: "filled", closedAt: day, fillPrice: close });
        } else {
          updateOrder(order.id, { status: "cancelled", closedAt: day, note: `Couldn't fill: ${result.message}` });
        }
      } else if (order.duration === "day" || day - order.createdAt > ORDER_MAX_AGE) {
        updateOrder(order.id, { status: "expired", closedAt: day });
      }
    }

    // 3. Alerts.
    current.alerts = (current.alerts as PriceAlert[]).map((a) => {
      if (a.triggeredAt !== undefined || a.createdAt >= day) return a;
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
