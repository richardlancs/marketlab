import { describe, expect, it } from "vitest";
import { contractId, optionValue, placeOptionOrder, settleOption, tradePrice, type OptionOrder } from "./option-trading";
import { bracketOrders, describeOrder, placePendingOrder, trailLevel, type NewOrder } from "./orders";
import { equityOf, processAccount, type MarketData } from "./processing";
import { buyingPower, placeOrder, shortValue, type Account, type Order } from "./trading";
import type { CorporateAction } from "./types";

const DAY = 86_400_000;
const close = (d: number) => d * DAY + 20 * 3600_000;
const raw = (prices: number[]) => prices.map((price, i) => ({ time: close(i + 1), price }));
const data = (prices: Record<string, number[]>, actions: Record<string, CorporateAction[]> = {}): MarketData => {
  const series = Object.fromEntries(Object.entries(prices).map(([s, p]) => [s, raw(p)]));
  const latest = Math.max(...Object.values(series).map((p) => p.at(-1)!.time));
  return { raw: series, actions, latest };
};
const account = (extra: Partial<Account> = {}): Account => ({ cash: 10_000, holdings: [], watchlist: [], trades: [], processedThrough: close(0), ...extra });
const market = (o: Partial<Order> = {}): Order => ({ symbol: "A", side: "buy", shares: 10, price: 50, id: "t1", time: close(0) + 1, ...o });
const pending = (o: Partial<NewOrder> = {}): NewOrder => ({ symbol: "A", side: "buy", type: "limit", shares: 10, price: 50, duration: "gtc", ...o });
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error((r as unknown as { message: string }).message);
  return r as Extract<T, { ok: true }>;
};

describe("selling short", () => {
  it("opens a short: proceeds in cash, 150% of its value set aside", () => {
    const after = ok(placeOrder(account(), market({ side: "sell", short: true, shares: 100, price: 50 }))).account;
    expect(after.holdings).toEqual([{ symbol: "A", shares: -100, averageCost: 50 }]);
    expect(after.cash).toBe(15_000);
    expect(shortValue(after)).toBe(5000);
    expect(buyingPower(after)).toBe(7500);
  });

  it("refuses a short beyond the margin, and a plain sale of shares not owned", () => {
    expect(placeOrder(account(), market({ side: "sell", short: true, shares: 500, price: 50 }))).toMatchObject({ ok: false, message: expect.stringContaining("set aside") });
    expect(placeOrder(account(), market({ side: "sell", shares: 1 }))).toMatchObject({ ok: false, message: expect.stringContaining("don't own") });
    const long = account({ holdings: [{ symbol: "A", shares: 5, averageCost: 40 }] });
    expect(placeOrder(long, market({ side: "sell", short: true, shares: 1 }))).toMatchObject({ ok: false, message: expect.stringContaining("Sell those first") });
  });

  it("covers at a gain when the price fell, and won't buy past the short", () => {
    const short = ok(placeOrder(account(), market({ side: "sell", short: true, shares: 100, price: 50 }))).account;
    expect(placeOrder(short, market({ shares: 101, price: 40 }))).toMatchObject({ ok: false, error: "short-position" });
    const covered = ok(placeOrder(short, market({ shares: 100, price: 40, id: "t2" })));
    expect(covered.trade.realizedGain).toBe(1000);
    expect(covered.account.holdings).toEqual([]);
    expect(covered.account.cash).toBe(11_000);
  });

  it("values shorts at the latest price for buying power", () => {
    const short = ok(placeOrder(account(), market({ side: "sell", short: true, shares: 100, price: 50 }))).account;
    expect(buyingPower(short, { A: 60 })).toBe(15_000 - 9000);
    expect(placeOrder(short, market({ symbol: "B", shares: 100, price: 70 }), { A: 60 })).toMatchObject({ ok: false, error: "insufficient-cash" });
  });
});

describe("processing shorts", () => {
  const short = (shares = 100, price = 50, cash = 15_000) => account({ cash, holdings: [{ symbol: "A", shares: -shares, averageCost: price }] });

  it("charges a borrow fee each close, kept as one event a month", () => {
    const after = processAccount(short(), data({ A: [50, 50] }));
    const fee = Math.round(((100 * 50 * 0.03) / 252) * 100) / 100;
    expect(after.cash).toBeCloseTo(15_000 - 2 * fee, 2);
    expect(after.events).toHaveLength(1);
    expect(after.events?.[0]).toMatchObject({ kind: "borrow-fee", shares: -100, cash: -2 * fee });
  });

  it("pays a dividend on a short", () => {
    const after = processAccount(short(), data({ A: [50] }, { A: [{ symbol: "A", time: close(1), kind: "dividend", amount: 1 }] }));
    expect(after.events?.find((e) => e.kind === "dividend")).toMatchObject({ shares: -100, cash: -100 });
  });

  it("splits a short toward zero, buying back the fraction", () => {
    const after = processAccount(short(5), data({ A: [60, 40] }, { A: [{ symbol: "A", time: close(2), kind: "split", ratio: 1.5 }] }));
    expect(after.holdings).toEqual([{ symbol: "A", shares: -7, averageCost: 50 / 1.5 }]);
    expect(after.events?.find((e) => e.kind === "split")).toMatchObject({ shares: -5, sharesAfter: -7, cash: -20 });
  });

  it("buys back just enough when equity falls below 30% of the shorts", () => {
    // Short 100 at $50 with $15,000 cash: equity $10,000. At $120, equity is 15,000 − 12,000 = $3,000 < 30% of $12,000.
    const after = processAccount(short(), data({ A: [120] }));
    const call = after.events?.find((e) => e.kind === "margin-call");
    expect(call).toMatchObject({ symbol: "A", value: 120 });
    const left = -after.holdings[0].shares;
    expect(left).toBe(83); // just enough: 17 bought back
    expect(equityOf(after, { A: 120 })).toBeGreaterThanOrEqual(0.3 * left * 120);
    expect(after.trades[0]).toMatchObject({ side: "buy", note: "Bought back by a margin call." });
  });

  it("leaves a short alone while equity is enough", () => {
    expect(processAccount(short(), data({ A: [60] })).events?.some((e) => e.kind === "margin-call")).toBe(false);
  });
});

describe("trailing stops", () => {
  const long = account({ holdings: [{ symbol: "A", shares: 10, averageCost: 40 }] });

  it("starts below the price, follows new highs, and never moves back", () => {
    const placed = ok(placePendingOrder(long, pending({ side: "sell", type: "trailing", trail: { kind: "percent", value: 10 } }), "o1", close(0) + 1, 50)).account;
    expect(placed.orders?.[0]).toMatchObject({ price: 45, extreme: 50 });
    const after = processAccount(placed, data({ A: [60, 55] }));
    expect(after.orders?.[0]).toMatchObject({ status: "open", extreme: 60, price: 54 });
    const sold = processAccount(after, data({ A: [60, 55, 53] }));
    expect(sold.orders?.[0]).toMatchObject({ status: "filled", fillPrice: 53 });
    expect(sold.holdings).toEqual([]);
  });

  it("only protects a position", () => {
    expect(placePendingOrder(account(), pending({ side: "sell", type: "trailing", trail: { kind: "amount", value: 2 } }), "o1", 0, 50)).toMatchObject({ ok: false });
    expect(trailLevel("buy", { kind: "amount", value: 2 }, 50)).toBe(52);
  });
});

describe("brackets", () => {
  it("places a stop-loss and take-profit when the buy fills, and one cancels the other", () => {
    const placed = ok(placePendingOrder(account(), pending({ price: 50, bracket: { stop: 45, target: 60 } }), "p", close(0) + 1)).account;
    const filled = processAccount(placed, data({ A: [49] }));
    expect(filled.orders?.filter((o) => o.status === "open").map((o) => [o.type, o.side, o.price, o.ocoGroup])).toEqual([
      ["stop", "sell", 45, "p"],
      ["limit", "sell", 60, "p"],
    ]);
    const done = processAccount(filled, data({ A: [49, 61] }));
    expect(done.orders?.find((o) => o.id === "p:target")).toMatchObject({ status: "filled" });
    expect(done.orders?.find((o) => o.id === "p:stop")).toMatchObject({ status: "cancelled", note: expect.stringContaining("bracket") });
    expect(done.holdings).toEqual([]);
  });

  it("checks the levels' sides, and allows a short's bracket", () => {
    expect(placePendingOrder(account(), pending({ bracket: { stop: 55 } }), "p", 0)).toMatchObject({ ok: false, message: expect.stringContaining("below") });
    const short = ok(placePendingOrder(account(), pending({ side: "sell", short: true, bracket: { stop: 55, target: 40 } }), "p", close(0) + 1)).account;
    expect(describeOrder(pending({ side: "sell", short: true, bracket: { stop: 55, target: 40 } }), (n) => `$${n}`)).toContain("Sell short 10 A");
    const filled = processAccount(short, data({ A: [51] }));
    expect(filled.holdings).toEqual([{ symbol: "A", shares: -10, averageCost: 51 }]);
    expect(filled.orders?.filter((o) => o.status === "open").every((o) => o.side === "buy")).toBe(true);
  });

  it("counts a bracket's two sell orders as one when checking shares", () => {
    const children = bracketOrders({ id: "p", symbol: "A", shares: 10, bracket: { stop: 45, target: 60 } }, 0);
    const held = account({ holdings: [{ symbol: "A", shares: 10, averageCost: 50 }], orders: children });
    expect(placePendingOrder(held, pending({ side: "sell", shares: 1, price: 70 }), "x", 0)).toMatchObject({ ok: false, message: expect.stringContaining("0 A shares") });
  });
});

describe("options", () => {
  const expiry = close(3);
  const opt = (o: Partial<OptionOrder> = {}): OptionOrder => ({ symbol: "A", contract: { kind: "call", strike: 50, expiry }, side: "buy", contracts: 2, price: 3, id: "o1", time: close(0) + 1, asOf: close(0), ...o });

  it("prices with a half-spread", () => {
    expect(tradePrice(2, "buy")).toBe(2.05);
    expect(tradePrice(10, "sell")).toBe(9.8);
    expect(optionValue({ kind: "put", strike: 50 }, 44)).toBe(6);
  });

  it("buys calls, then settles them in cash at expiry", () => {
    const bought = ok(placeOptionOrder(account(), opt())).account;
    expect(bought.cash).toBe(9400);
    expect(bought.options).toEqual([{ id: contractId("A", opt().contract), symbol: "A", kind: "call", strike: 50, expiry, contracts: 2, averagePremium: 3 }]);
    const after = processAccount(bought, data({ A: [52, 54, 58] }));
    expect(after.options).toEqual([]);
    expect(after.cash).toBe(9400 + 2 * 100 * 8);
    expect(after.trades[0]).toMatchObject({ side: "sell", price: 8, realizedGain: 1000, option: { kind: "call", strike: 50 } });
    expect(after.events?.[0]).toMatchObject({ kind: "expiry", value: 8, shares: 2 });
  });

  it("writes only covered calls and cash-secured puts", () => {
    expect(placeOptionOrder(account(), opt({ side: "sell" }))).toMatchObject({ ok: false, message: expect.stringContaining("covered call") });
    const shares = account({ holdings: [{ symbol: "A", shares: 200, averageCost: 40 }] });
    const covered = ok(placeOptionOrder(shares, opt({ side: "sell" }))).account;
    expect(covered.options?.[0].contracts).toBe(-2);
    expect(placeOrder(covered, market({ side: "sell", shares: 1 }))).toMatchObject({ ok: false, message: expect.stringContaining("cover calls") });
    const put = opt({ side: "sell", contract: { kind: "put", strike: 50, expiry } });
    expect(placeOptionOrder(account({ cash: 5000 }), put)).toMatchObject({ ok: false, message: expect.stringContaining("cash-secured") });
    const secured = ok(placeOptionOrder(account(), put)).account;
    expect(buyingPower(secured)).toBe(10_600 - 10_000);
  });

  it("settles a written put that ends in the money by paying out", () => {
    const secured = ok(placeOptionOrder(account(), opt({ side: "sell", contract: { kind: "put", strike: 50, expiry } }))).account;
    const after = settleOption(secured, secured.options![0], 45, expiry);
    expect(after.cash).toBe(10_600 - 1000);
    expect(after.trades[0]).toMatchObject({ side: "buy", price: 5, realizedGain: 600 - 1000 });
  });

  it("refuses expired contracts", () => {
    expect(placeOptionOrder(account(), opt({ asOf: expiry }))).toMatchObject({ ok: false, message: expect.stringContaining("expired") });
  });

  it("follows a 2-for-1 split: twice the contracts at half the strike", () => {
    const bought = ok(placeOptionOrder(account(), opt())).account;
    const after = processAccount(bought, data({ A: [52] }, { A: [{ symbol: "A", time: close(1), kind: "split", ratio: 2 }] }));
    expect(after.options?.[0]).toMatchObject({ strike: 25, contracts: 4, averagePremium: 1.5 });
  });
});
