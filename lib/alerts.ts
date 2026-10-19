/**
 * Price alerts: "tell me when KO closes above $70". Checked against each
 * daily close after the alert was made, like orders (lib/orders.ts). An
 * alert triggers once and then stays in the list, marked, until removed.
 */
import { MAX_ALERTS, type Account, type PriceAlert } from "./trading";

export const alertTriggers = (alert: Pick<PriceAlert, "direction" | "price">, close: number) =>
  alert.direction === "above" ? close >= alert.price : close <= alert.price;

/** Triggered alerts the user hasn't seen yet: the header's badge. */
export const unseenAlerts = (account: Account) => (account.alerts ?? []).filter((a) => a.triggeredAt !== undefined && !a.seen);

type Added = { ok: true; account: Account; alert: PriceAlert } | { ok: false; message: string };

export function addAlert(account: Account, input: { symbol: string; direction: PriceAlert["direction"]; price: number }, id: string, now: number): Added {
  if (input.direction !== "above" && input.direction !== "below") return { ok: false, message: "That alert isn't valid." };
  if (!Number.isFinite(input.price) || input.price <= 0 || input.price > 1_000_000) return { ok: false, message: "Enter a price above $0." };
  if ((account.alerts ?? []).length >= MAX_ALERTS) return { ok: false, message: `You can have up to ${MAX_ALERTS} alerts. Remove one to make room.` };
  const alert: PriceAlert = { id, symbol: input.symbol, direction: input.direction, price: Math.round(input.price * 100) / 100, createdAt: now };
  return { ok: true, alert, account: { ...account, alerts: [alert, ...(account.alerts ?? [])] } };
}

export const removeAlert = (account: Account, id: string): Account => ({ ...account, alerts: (account.alerts ?? []).filter((a) => a.id !== id) });

/** Marks every triggered alert as seen (the user opened the alerts list). */
export function markAlertsSeen(account: Account): Account {
  if (unseenAlerts(account).length === 0) return account;
  return { ...account, alerts: (account.alerts ?? []).map((a) => (a.triggeredAt !== undefined ? { ...a, seen: true } : a)) };
}
