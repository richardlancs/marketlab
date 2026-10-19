import { describe, expect, it } from "vitest";
import { startingAccount } from "./starting-account";
import { placeOrder, parseAccount, toggleWatchlist, totalRealizedGain, type Account, type Order } from "./trading";

const SYMBOLS = ["AAPL", "MSFT", "TSLA"];

const empty = (cash = 1000): Account => ({ cash, holdings: [], watchlist: [], trades: [] });

let n = 0;
const order = (side: Order["side"], symbol: string, shares: number, price: number): Order => ({
  side,
  symbol,
  shares,
  price,
  id: `t${++n}`,
  time: 1_760_000_000_000 + n,
});

/** Places an order that must succeed, and returns the new account. */
function fill(account: Account, o: Order): Account {
  const result = placeOrder(account, o);
  if (!result.ok) throw new Error(`expected a fill, got ${result.error}`);
  return result.account;
}

describe("placeOrder: buying", () => {
  it("opens a position and spends the cash", () => {
    const after = fill(empty(), order("buy", "AAPL", 2, 100.25));
    expect(after.cash).toBe(799.5);
    expect(after.holdings).toEqual([{ symbol: "AAPL", shares: 2, averageCost: 100.25 }]);
    expect(after.trades).toHaveLength(1);
    expect(after.trades[0]).toMatchObject({ side: "buy", shares: 2, price: 100.25 });
    expect(after.trades[0].realizedGain).toBeUndefined();
  });

  it("averages the cost when adding to a position", () => {
    let account = fill(empty(10_000), order("buy", "AAPL", 10, 100));
    account = fill(account, order("buy", "AAPL", 30, 200));
    // (10 × 100 + 30 × 200) / 40 = 175
    expect(account.holdings).toEqual([{ symbol: "AAPL", shares: 40, averageCost: 175 }]);
    expect(account.cash).toBe(3000);
  });

  it("allows spending exactly all the cash, but not a cent more", () => {
    expect(placeOrder(empty(100), order("buy", "AAPL", 1, 100)).ok).toBe(true);
    const result = placeOrder(empty(100), order("buy", "AAPL", 1, 100.01));
    expect(result).toMatchObject({ ok: false, error: "insufficient-cash" });
  });

  it("keeps cash in whole cents over many trades", () => {
    let account = empty(1000);
    for (let i = 0; i < 10; i++) account = fill(account, order("buy", "AAPL", 1, 0.1));
    expect(account.cash).toBe(999); // not 998.9999999999998
  });
});

describe("placeOrder: selling", () => {
  const holding = (): Account => ({ ...empty(0), holdings: [{ symbol: "MSFT", shares: 10, averageCost: 50 }] });

  it("records the realized gain and keeps the average cost", () => {
    const after = fill(holding(), order("sell", "MSFT", 4, 60));
    expect(after.cash).toBe(240);
    expect(after.holdings).toEqual([{ symbol: "MSFT", shares: 6, averageCost: 50 }]);
    expect(after.trades[0].realizedGain).toBe(40); // 4 × (60 − 50)
  });

  it("records losses as negative gains", () => {
    expect(fill(holding(), order("sell", "MSFT", 10, 45)).trades[0].realizedGain).toBe(-50);
  });

  it("removes the position when every share is sold", () => {
    expect(fill(holding(), order("sell", "MSFT", 10, 55)).holdings).toEqual([]);
  });

  it("refuses to sell more than you own, or what you don't own", () => {
    expect(placeOrder(holding(), order("sell", "MSFT", 11, 55))).toMatchObject({ ok: false, error: "insufficient-shares" });
    expect(placeOrder(holding(), order("sell", "TSLA", 1, 55))).toMatchObject({ ok: false, error: "insufficient-shares" });
  });
});

describe("placeOrder: bad input", () => {
  it.each([0, -1, 1.5, Number.NaN, 2_000_000])("rejects %s shares", (shares) => {
    expect(placeOrder(empty(), order("buy", "AAPL", shares, 1))).toMatchObject({ ok: false, error: "invalid-shares" });
  });

  it("rejects a missing or zero price", () => {
    expect(placeOrder(empty(), order("buy", "AAPL", 1, 0))).toMatchObject({ ok: false, error: "invalid-price" });
    expect(placeOrder(empty(), order("buy", "AAPL", 1, Number.NaN))).toMatchObject({ ok: false, error: "invalid-price" });
  });

  it("doesn't change the account it was given", () => {
    const account = startingAccount();
    const before = JSON.stringify(account);
    placeOrder(account, order("buy", "AAPL", 1, 100));
    placeOrder(account, order("sell", "AAPL", 1, 100));
    expect(JSON.stringify(account)).toBe(before);
  });
});

describe("toggleWatchlist", () => {
  it("adds to the end, and removes when already there", () => {
    const added = toggleWatchlist({ ...empty(), watchlist: ["AAPL"] }, "TSLA");
    expect(added.watchlist).toEqual(["AAPL", "TSLA"]);
    expect(toggleWatchlist(added, "AAPL").watchlist).toEqual(["TSLA"]);
  });
});

describe("totalRealizedGain", () => {
  it("adds up the gains and losses of every sell", () => {
    let account: Account = { ...empty(0), holdings: [{ symbol: "AAPL", shares: 10, averageCost: 10 }] };
    account = fill(account, order("sell", "AAPL", 5, 12)); // +10
    account = fill(account, order("sell", "AAPL", 5, 9)); // −5
    expect(totalRealizedGain(account)).toBe(5);
  });
});

describe("parseAccount", () => {
  const valid = { cash: 50, holdings: [{ symbol: "AAPL", shares: 1, averageCost: 10 }], watchlist: ["TSLA"], trades: [] };

  it("accepts a valid account and the starting account", () => {
    expect(parseAccount(valid, SYMBOLS)).toEqual(valid);
    expect(parseAccount(startingAccount(), ["AAPL", "MSFT", "NVDA", "AMZN", "JPM", "TSLA", "META", "NFLX"])).toEqual(startingAccount());
  });

  it("drops unknown fields", () => {
    expect(parseAccount({ ...valid, extra: true }, SYMBOLS)).toEqual(valid);
  });

  it.each([
    ["not an object", "hello"],
    ["negative cash", { ...valid, cash: -1 }],
    ["an unknown symbol", { ...valid, watchlist: ["ZZZZ"] }],
    ["a duplicate watchlist entry", { ...valid, watchlist: ["TSLA", "TSLA"] }],
    ["two holdings of one symbol", { ...valid, holdings: [valid.holdings[0], valid.holdings[0]] }],
    ["fractional shares", { ...valid, holdings: [{ symbol: "AAPL", shares: 0.5, averageCost: 10 }] }],
    ["a malformed trade", { ...valid, trades: [{ id: "x", symbol: "AAPL", side: "hold", shares: 1, price: 1, time: 1 }] }],
  ])("rejects %s", (_, value) => {
    expect(parseAccount(value, SYMBOLS)).toBeNull();
  });
});
