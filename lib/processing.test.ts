import { describe, expect, it } from "vitest";
import { addAlert } from "./alerts";
import { cancelPendingOrder, describeOrder, placePendingOrder, triggers, type NewOrder } from "./orders";
import { processAccount, type MarketData } from "./processing";
import { parseAccount, type Account } from "./trading";
import type { CorporateAction } from "./types";

const DAY = 86_400_000;
const close = (d: number) => d * DAY + 20 * 3600_000;
/** Closes for days 1..n, each day's close given. */
const raw = (prices: number[]) => prices.map((price, i) => ({ time: close(i + 1), price }));
const data = (prices: Record<string, number[]>, actions: Record<string, CorporateAction[]> = {}): MarketData => {
  const series = Object.fromEntries(Object.entries(prices).map(([s, p]) => [s, raw(p)]));
  const latest = Math.max(...Object.values(series).map((p) => p.at(-1)!.time));
  return { raw: series, actions, latest };
};
const base = (extra: Partial<Account> = {}): Account => ({
  cash: 10_000,
  holdings: [{ symbol: "A", shares: 5, averageCost: 30 }],
  watchlist: [],
  trades: [],
  processedThrough: close(0),
  ...extra,
});
const order = (o: Partial<NewOrder> = {}): NewOrder => ({ symbol: "A", side: "buy", type: "limit", shares: 10, price: 45, duration: "gtc", ...o });
/** Places an order just after day 0's close. */
const withOrder = (account: Account, o: Partial<NewOrder>) => {
  const placed = placePendingOrder(account, order(o), "o1", close(0) + 3600_000);
  if (!placed.ok) throw new Error(placed.message);
  return placed.account;
};

describe("processAccount: dividends and splits", () => {
  it("pays a dividend on the shares held", () => {
    const after = processAccount(base(), data({ A: [50, 49] }, { A: [{ symbol: "A", time: close(2), kind: "dividend", amount: 0.5 }] }));
    expect(after.cash).toBe(10_002.5);
    expect(after.events).toEqual([{ id: `dividend:A:${close(2)}`, kind: "dividend", symbol: "A", time: close(2), shares: 5, value: 0.5, cash: 2.5 }]);
    expect(after.processedThrough).toBe(close(2));
  });

  it("splits 3-for-2: whole shares, cash for the fraction, average cost divided", () => {
    const after = processAccount(base(), data({ A: [60, 40] }, { A: [{ symbol: "A", time: close(2), kind: "split", ratio: 1.5 }] }));
    expect(after.holdings).toEqual([{ symbol: "A", shares: 7, averageCost: 20 }]);
    expect(after.cash).toBe(10_020); // half a share at $40
    expect(after.events?.[0]).toMatchObject({ kind: "split", shares: 5, sharesAfter: 7, cash: 20 });
  });

  it("cancels open orders on a split stock and rescales its alerts", () => {
    let account = withOrder(base(), { side: "sell", shares: 5, price: 100 });
    const alert = addAlert(account, { symbol: "A", direction: "above", price: 100 }, "al", close(0) + 1);
    if (!alert.ok) throw new Error();
    account = alert.account;
    const after = processAccount(account, data({ A: [60, 30] }, { A: [{ symbol: "A", time: close(2), kind: "split", ratio: 2 }] }));
    expect(after.orders?.[0]).toMatchObject({ status: "cancelled", note: expect.stringContaining("split") });
    expect(after.alerts?.[0].price).toBe(50);
  });

  it("changes nothing when run twice", () => {
    const market = data({ A: [50, 49, 48] }, { A: [{ symbol: "A", time: close(2), kind: "dividend", amount: 1 }] });
    const once = processAccount(withOrder(base(), { price: 48.5 }), market);
    expect(processAccount(once, market)).toEqual(once);
  });

  it("starts tracking a new account from now, without applying the past", () => {
    const fresh = base({ processedThrough: undefined });
    const after = processAccount(fresh, data({ A: [50] }, { A: [{ symbol: "A", time: close(1), kind: "dividend", amount: 1 }] }));
    expect(after).toEqual({ ...fresh, processedThrough: close(1) });
  });

  it("waits when a needed stock has no prices yet, instead of skipping its closes", () => {
    const account = withOrder(base(), { symbol: "B" });
    expect(processAccount(account, data({ A: [50] }))).toBe(account);
  });
});

describe("processAccount: orders", () => {
  it.each([
    ["buy limit", { side: "buy", type: "limit", price: 45 }, [50, 44], 44],
    ["sell limit", { side: "sell", type: "limit", price: 55, shares: 5 }, [50, 56], 56],
    ["buy stop", { side: "buy", type: "stop", price: 55 }, [50, 56], 56],
    ["sell stop", { side: "sell", type: "stop", price: 45, shares: 5 }, [50, 44], 44],
  ] as const)("fills a %s at the first close that reaches it", (_, o, prices, fill) => {
    const after = processAccount(withOrder(base(), o), data({ A: [...prices] }));
    expect(after.orders?.[0]).toMatchObject({ status: "filled", fillPrice: fill, closedAt: close(2) });
    expect(after.trades[0]).toMatchObject({ id: "o1", price: fill, time: close(2) });
  });

  it("fills a stop at the close after a gap, below the stop", () => {
    const after = processAccount(withOrder(base(), { side: "sell", type: "stop", price: 45, shares: 5 }), data({ A: [50, 30] }));
    expect(after.trades[0].price).toBe(30);
    expect(after.holdings).toEqual([]);
  });

  it("expires a day order after one close, and a good-till-cancelled one after 90 days", () => {
    expect(processAccount(withOrder(base(), { duration: "day" }), data({ A: [50, 44] })).orders?.[0]).toMatchObject({ status: "expired", closedAt: close(1) });
    const prices = Array.from({ length: 95 }, () => 50);
    expect(processAccount(withOrder(base(), {}), data({ A: prices })).orders?.[0]).toMatchObject({ status: "expired", closedAt: close(91) });
  });

  it("cancels an order that can't fill, with the reason", () => {
    const poor = base({ cash: 500 });
    const placed = placePendingOrder({ ...poor, cash: 1000 }, order({ shares: 20, price: 45 }), "o1", close(0) + 1);
    if (!placed.ok) throw new Error(placed.message);
    const after = processAccount({ ...placed.account, cash: 500 }, data({ A: [50, 44] }));
    expect(after.orders?.[0]).toMatchObject({ status: "cancelled", note: expect.stringContaining("enough cash") });
  });

  it("doesn't check an order against the close it was placed after", () => {
    const placed = placePendingOrder(base(), order(), "o1", close(1) + 1);
    if (!placed.ok) throw new Error(placed.message);
    const after = processAccount(placed.account, data({ A: [40, 50] }));
    expect(after.orders?.[0].status).toBe("open");
  });
});

describe("placing and cancelling orders", () => {
  it("refuses orders the account couldn't cover, and too many", () => {
    expect(placePendingOrder(base(), order({ shares: 1000 }), "x", 0)).toMatchObject({ ok: false, message: expect.stringContaining("cash") });
    expect(placePendingOrder(base(), order({ side: "sell", shares: 6 }), "x", 0)).toMatchObject({ ok: false });
    expect(placePendingOrder(base(), order({ price: -1 }), "x", 0)).toMatchObject({ ok: false });
    let account = base({ cash: 1e9 });
    for (let i = 0; i < 20; i++) {
      const r = placePendingOrder(account, order({ shares: 1 }), `o${i}`, 0);
      if (!r.ok) throw new Error(r.message);
      account = r.account;
    }
    expect(placePendingOrder(account, order({ shares: 1 }), "o21", 0)).toMatchObject({ ok: false, message: expect.stringContaining("20") });
  });

  it("cancels only open orders", () => {
    const account = withOrder(base(), {});
    expect(cancelPendingOrder(account, "o1", 5).orders?.[0]).toMatchObject({ status: "cancelled", closedAt: 5 });
    expect(cancelPendingOrder(account, "nope", 5)).toBe(account);
  });

  it("describes and checks each order type", () => {
    expect(describeOrder(order(), (n) => `$${n}`)).toBe("Buy 10 A if a close is at or below $45");
    expect(describeOrder(order({ side: "sell", type: "stop" }), (n) => `$${n}`)).toBe("Sell 10 A if a close is at or below $45");
    expect(triggers({ side: "buy", type: "stop", price: 10 }, 10)).toBe(true);
  });
});

describe("alerts", () => {
  it("trigger once, on the first close past the level, not on the creation day", () => {
    const added = addAlert(base(), { symbol: "A", direction: "below", price: 45 }, "al", close(1) + 1);
    if (!added.ok) throw new Error();
    const after = processAccount(added.account, data({ A: [40, 44, 30] }));
    expect(after.alerts?.[0]).toMatchObject({ triggeredAt: close(2), triggerPrice: 44 });
  });
});

describe("stored accounts", () => {
  it("still load without the Phase 7 fields, and keep them when present", () => {
    const old = { cash: 1, holdings: [], watchlist: [], trades: [] };
    expect(parseAccount(old, () => true)).toEqual(old);
    const processed = processAccount(withOrder(base(), {}), data({ A: [50, 44] }, { A: [{ symbol: "A", time: close(1), kind: "dividend", amount: 1 }] }));
    expect(parseAccount(JSON.parse(JSON.stringify(processed)), () => true)).toEqual(processed);
  });
});
