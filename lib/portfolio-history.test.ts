import { describe, expect, it } from "vitest";
import { summarizePortfolio } from "./portfolio";
import { firstTradeTime, holdingsTimeline, portfolioValueSeries, rebase, relevantSymbols } from "./portfolio-history";
import { placeOrder, type Account } from "./trading";
import type { PricePoint } from "./types";

const DAY = 86_400_000;
// Closes on days 0..4, at 20:00 each day.
const times = [0, 1, 2, 3, 4].map((d) => d * DAY + 20 * 3600_000);
const prices = (values: number[]): PricePoint[] => values.map((price, i) => ({ time: times[i], price }));
const history = { A: prices([10, 11, 12, 13, 14]), B: prices([50, 50, 40, 40, 60]) };

const start: Account = { cash: 1000, holdings: [{ symbol: "A", shares: 10, averageCost: 9 }], watchlist: [], trades: [] };

/** Replays orders forward, the way the app made them: each filled at that day's close, stamped an hour later. */
function replay(orders: { day: number; symbol: string; side: "buy" | "sell"; shares: number }[]): { account: Account; states: Account[] } {
  let account = start;
  const states: Account[] = [];
  for (let day = 0; day < times.length; day++) {
    for (const o of orders.filter((x) => x.day === day)) {
      const result = placeOrder(account, { ...o, price: history[o.symbol as "A" | "B"][day].price, id: `${day}${o.symbol}`, time: times[day] + 3600_000 });
      if (!result.ok) throw new Error(result.message);
      account = result.account;
    }
    states.push(account);
  }
  return { account, states };
}

describe("portfolio history", () => {
  it("with no trades, values today's holdings at each day's price", () => {
    expect(portfolioValueSeries(start, history, times).map((p) => p.price)).toEqual([1100, 1110, 1120, 1130, 1140]);
  });

  it("matches a forward replay of the same trades, day by day", () => {
    const { account, states } = replay([
      { day: 1, symbol: "B", side: "buy", shares: 4 },
      { day: 3, symbol: "A", side: "sell", shares: 6 },
      { day: 3, symbol: "B", side: "buy", shares: 2 },
    ]);
    const timeline = holdingsTimeline(account, times);
    timeline.forEach((state, day) => {
      expect(state.cash).toBeCloseTo(states[day].cash, 2);
      for (const h of states[day].holdings) expect(state.shares[h.symbol]).toBe(h.shares);
    });
  });

  it("ends at today's value (the same number the portfolio card shows)", () => {
    const { account } = replay([{ day: 2, symbol: "B", side: "buy", shares: 5 }]);
    const last = portfolioValueSeries(account, history, times).at(-1)?.price;
    const quotes = [
      { symbol: "A", name: "A", price: 14, change: 0 },
      { symbol: "B", name: "B", price: 60, change: 0 },
    ];
    expect(last).toBeCloseTo(summarizePortfolio(account.holdings, quotes, account.cash).totalValue, 6);
  });

  it("counts a trade made after a close on that close's day, not the next one", () => {
    const { account } = replay([{ day: 2, symbol: "B", side: "buy", shares: 5 }]);
    const timeline = holdingsTimeline(account, times);
    expect(timeline[1].shares.B ?? 0).toBe(0);
    expect(timeline[2].shares.B).toBe(5);
  });

  it("stays exact from the oldest kept trade when older ones were dropped", () => {
    const { account, states } = replay([
      { day: 1, symbol: "B", side: "buy", shares: 4 },
      { day: 3, symbol: "B", side: "sell", shares: 2 },
    ]);
    // Drop the oldest trade, as the 500-trade limit would.
    const truncated = { ...account, trades: account.trades.slice(0, 1) };
    const timeline = holdingsTimeline(truncated, times);
    for (const day of [3, 4]) expect(timeline[day].cash).toBeCloseTo(states[day].cash, 2);
  });

  it("carries the last price over gaps, and refuses a symbol with no prices", () => {
    const gappy = { A: [history.A[0], history.A[3]] };
    expect(portfolioValueSeries(start, gappy, times).map((p) => p.price)).toEqual([1100, 1100, 1100, 1130, 1130]);
    expect(() => portfolioValueSeries(start, {}, times)).toThrow(/A/);
  });

  it("lists the symbols to load and the first trade", () => {
    const { account } = replay([{ day: 1, symbol: "B", side: "buy", shares: 1 }, { day: 2, symbol: "B", side: "sell", shares: 1 }]);
    expect(relevantSymbols(account)).toEqual(["A", "B"]);
    expect(firstTradeTime(account)).toBe(times[1] + 3600_000);
    expect(firstTradeTime(start)).toBeNull();
  });

  it("rebases a series to start at 100", () => {
    expect(rebase([50, 75, 25])).toEqual([100, 150, 50]);
  });
});
