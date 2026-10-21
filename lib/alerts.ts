/**
 * Alerts, checked against each daily close after the alert was made, like
 * orders (lib/orders.ts). An alert triggers once and then stays in the list,
 * marked, until removed.
 *
 * - Price alerts: "tell me when KO closes above $70".
 * - Indicator alerts, on split-adjusted closes (so a split never looks like a crash):
 *   - RSI: RSI(days) closes above (or below) a level, having been on the other side the day before;
 *   - average cross: the close crosses above (or below) its `days`-day average, which includes that close;
 *   - big move: the close is up (or down) at least `percent`% on the previous close;
 *   - 52-week range: the close is above every close of the previous 252 sessions (or below every one).
 */
import { formatCurrency } from "./format";
import { indicatorSeries } from "./backtest/rules";
import { MAX_ALERTS, parseAlertCondition, type Account, type AlertCondition, type PriceAlert } from "./trading";

export const alertTriggers = (alert: Pick<PriceAlert, "direction" | "price">, close: number) =>
  alert.direction === "above" ? close >= alert.price : close <= alert.price;

/** "closes at or above $70", "RSI(14) rises above 70", "crosses above its 200-day average"… */
export function describeAlert(alert: Pick<PriceAlert, "direction" | "price" | "condition">): string {
  const up = alert.direction === "above";
  const c = alert.condition;
  if (!c) return `${up ? "closes at or above" : "closes at or below"} ${formatCurrency(alert.price)}`;
  switch (c.kind) {
    case "rsi":
      return `RSI(${c.days}) ${up ? "rises above" : "falls below"} ${c.level}`;
    case "sma-cross":
      return `crosses ${up ? "above" : "below"} its ${c.days}-day average`;
    case "move":
      return `${up ? "rises" : "falls"} ${c.percent}% or more in a day`;
    case "range-52w":
      return `makes a new 52-week ${up ? "high" : "low"}`;
  }
}

/**
 * Whether an indicator condition is met at session `i` of `closes`
 * (split-adjusted, oldest first, every session up to and including i).
 * `cache` keeps each symbol's indicator series between alerts and days.
 */
export function conditionMet(condition: AlertCondition, direction: PriceAlert["direction"], closes: readonly number[], i: number, cache: Map<string, number[]>): boolean {
  if (i < 1) return false;
  const up = direction === "above";
  const series = (key: string, make: () => number[]) => {
    let s = cache.get(key);
    if (!s) cache.set(key, (s = make()));
    return s;
  };
  switch (condition.kind) {
    case "rsi": {
      const rsi = series(`rsi:${condition.days}`, () => indicatorSeries({ kind: "rsi", days: condition.days }, closes));
      const [before, now] = [rsi[i - 1], rsi[i]];
      return up ? before <= condition.level && now > condition.level : before >= condition.level && now < condition.level;
    }
    case "sma-cross": {
      // The average after each close, including it (what charts show for that day).
      const sma = series(`sma:${condition.days}`, () => indicatorSeries({ kind: "sma", days: condition.days }, closes));
      return up ? closes[i - 1] <= sma[i - 1] && closes[i] > sma[i] : closes[i - 1] >= sma[i - 1] && closes[i] < sma[i];
    }
    case "move": {
      const change = closes[i] / closes[i - 1] - 1;
      return up ? change >= condition.percent / 100 : change <= -condition.percent / 100;
    }
    case "range-52w": {
      if (i < 252) return false;
      const past = closes.slice(i - 252, i);
      return up ? closes[i] > Math.max(...past) : closes[i] < Math.min(...past);
    }
  }
}

/** Triggered alerts the user hasn't seen yet: the header's badge. */
export const unseenAlerts = (account: Account) => (account.alerts ?? []).filter((a) => a.triggeredAt !== undefined && !a.seen);

type Added = { ok: true; account: Account; alert: PriceAlert } | { ok: false; message: string };

export function addAlert(
  account: Account,
  input: { symbol: string; direction: PriceAlert["direction"]; price: number; condition?: unknown },
  id: string,
  now: number,
): Added {
  if (input.direction !== "above" && input.direction !== "below") return { ok: false, message: "That alert isn't valid." };
  if (!Number.isFinite(input.price) || input.price <= 0 || input.price > 1_000_000) return { ok: false, message: "Enter a price above $0." };
  const condition = input.condition === undefined ? undefined : parseAlertCondition(input.condition);
  if (condition === null) return { ok: false, message: "Check the alert's settings: RSI levels are between 0 and 100, averages 5 to 250 days, moves 0.5% to 50%." };
  if ((account.alerts ?? []).length >= MAX_ALERTS) return { ok: false, message: `You can have up to ${MAX_ALERTS} alerts. Remove one to make room.` };
  const alert: PriceAlert = { id, symbol: input.symbol, direction: input.direction, price: Math.round(input.price * 100) / 100, ...(condition && { condition }), createdAt: now };
  return { ok: true, alert, account: { ...account, alerts: [alert, ...(account.alerts ?? [])] } };
}

export const removeAlert = (account: Account, id: string): Account => ({ ...account, alerts: (account.alerts ?? []).filter((a) => a.id !== id) });

/** Marks every triggered alert as seen (the user opened the alerts list). */
export function markAlertsSeen(account: Account): Account {
  if (unseenAlerts(account).length === 0) return account;
  return { ...account, alerts: (account.alerts ?? []).map((a) => (a.triggeredAt !== undefined ? { ...a, seen: true } : a)) };
}
