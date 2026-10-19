/**
 * The simulated portfolio's value on each past day, rebuilt from its trades.
 *
 * An account only stores where it is *now* (cash, holdings) and its trades,
 * newest first, so the history is worked out backward: start from today and
 * undo each trade, newest first, as the days go back. That needs no record of
 * how the account started, and it's exact back to the oldest trade kept (an
 * account keeps its latest 500). Before the first trade it shows the starting
 * holdings, carried back in time.
 *
 * There are no deposits or withdrawals in the simulator, so the value only
 * changes with prices: the plain start-to-end return is already the fair
 * ("time-weighted") one. Pure functions, shared by guest and signed-in modes.
 */
import { roundCents, type Account, type Trade } from "./trading";
import type { PricePoint } from "./types";

export interface DayState {
  cash: number;
  shares: Record<string, number>;
}

/** Every stock the account holds now or has traded: what the history needs prices for. */
export function relevantSymbols(account: Account): string[] {
  return [...new Set([...account.holdings.map((h) => h.symbol), ...account.trades.map((t) => t.symbol)])];
}

/** When the oldest kept trade was made, or null if there are none. */
export const firstTradeTime = (account: Account): number | null =>
  account.trades.length ? Math.min(...account.trades.map((t) => t.time)) : null;

/**
 * Cash and shares at each of `times` (ascending daily closes).
 *
 * A trade fills at the latest close but is stamped with the moment it was
 * made, which is after that close. So it belongs to the latest point with
 * `time <= trade.time`: the state at a close includes the trades filled at
 * that close's price. That keeps the last point equal to today's value.
 */
export function holdingsTimeline(account: Account, times: number[]): DayState[] {
  const trades: Trade[] = [...account.trades].sort((a, b) => b.time - a.time); // newest first
  let cash = account.cash;
  const shares: Record<string, number> = Object.fromEntries(account.holdings.map((h) => [h.symbol, h.shares]));
  const states: DayState[] = new Array(times.length);
  let next = 0; // the newest trade not yet undone

  for (let i = times.length - 1; i >= 0; i--) {
    // Undo the trades that belong to later points than this one.
    const after = i + 1 < times.length ? times[i + 1] : Number.POSITIVE_INFINITY;
    while (next < trades.length && trades[next].time >= after) {
      const t = trades[next++];
      const total = roundCents(t.shares * t.price);
      const held = shares[t.symbol] ?? 0;
      if (t.side === "buy") {
        cash += total;
        shares[t.symbol] = held - t.shares;
      } else {
        cash -= total;
        shares[t.symbol] = held + t.shares;
      }
    }
    states[i] = { cash: roundCents(cash), shares: { ...shares } };
  }
  return states;
}

/**
 * The portfolio's total value at each of `times`. `history` has each relevant
 * symbol's daily closes. A day without a price for a symbol uses its last
 * known one (or, before its first, its first). Throws if a symbol held at
 * some point has no prices at all.
 */
export function portfolioValueSeries(account: Account, history: Record<string, PricePoint[]>, times: number[]): PricePoint[] {
  const states = holdingsTimeline(account, times);
  const symbols = relevantSymbols(account);
  const missing = symbols.find((s) => !history[s]?.length);
  if (missing) throw new Error(`No prices for ${missing}`);

  // Walk each symbol's prices alongside the days, carrying the last price forward.
  const priceAt: Record<string, number[]> = {};
  for (const symbol of symbols) {
    const points = history[symbol];
    const values: number[] = new Array(times.length);
    let j = 0;
    let last = points[0].price;
    for (let i = 0; i < times.length; i++) {
      while (j < points.length && points[j].time <= times[i]) last = points[j++].price;
      values[i] = last;
    }
    priceAt[symbol] = values;
  }

  return times.map((time, i) => {
    const { cash, shares } = states[i];
    let value = cash;
    for (const [symbol, count] of Object.entries(shares)) if (count) value += count * priceAt[symbol][i];
    return { time, price: value };
  });
}

/** Rescales a series so it starts at `base` (e.g. growth of $100), to compare lines of different sizes on one axis. */
export function rebase(values: number[], base = 100): number[] {
  const first = values[0];
  return first ? values.map((v) => (v / first) * base) : values.map(() => base);
}
