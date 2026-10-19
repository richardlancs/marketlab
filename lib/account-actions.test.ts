// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startingAccount } from "./starting-account";

// The actions' collaborators are replaced with test doubles: the session
// lookup, the database, the market, and Next's request headers.
const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
const accounts = vi.hoisted(() => ({
  load: vi.fn(),
  ensure: vi.fn(),
  toggleWatchlist: vi.fn(),
  placeOrder: vi.fn(),
  reset: vi.fn(),
  create: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("./auth", () => ({ auth: { api: { getSession: async () => session.current } } }));
vi.mock("./db", () => ({ accounts }));
// A fixed market, so prices don't depend on the date (or on Next's cache).
// AAPL and KO exist; KO's prices are unavailable right now.
const listing = (symbol: string) => (["AAPL", "KO", "V", "MSFT", "NVDA", "AMZN", "JPM", "TSLA", "META", "NFLX"].includes(symbol) ? { symbol, name: symbol, sector: null } : null);
vi.mock("./market", async () => ({
  getListing: async (symbol: string) => listing(symbol),
  getStockDetail: async (symbol: string) =>
    symbol === "AAPL" ? { status: "ok", stock: { symbol, price: 248.3 } } : listing(symbol) ? { status: "unavailable", listing: listing(symbol) } : null,
}));

const { importGuestAccountAction, placeOrderAction, resetAccountAction, toggleWatchlistAction } = await import("./account-actions");

beforeEach(() => {
  vi.clearAllMocks();
  session.current = { user: { id: "user-1" } };
  accounts.ensure.mockResolvedValue(startingAccount());
});

describe("account actions", () => {
  it("refuse to do anything when signed out", async () => {
    session.current = null;
    for (const result of [
      await toggleWatchlistAction("AAPL"),
      await placeOrderAction("AAPL", "buy", 1),
      await resetAccountAction(),
      await importGuestAccountAction(startingAccount()),
    ]) {
      expect(result).toMatchObject({ ok: false, message: expect.stringContaining("Sign in") });
    }
    expect(Object.values(accounts).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it("act only on the signed-in user, whatever the arguments say", async () => {
    await toggleWatchlistAction("AAPL");
    expect(accounts.toggleWatchlist).toHaveBeenCalledWith("user-1", "AAPL");
  });

  it("reject unknown symbols and malformed orders before touching the database", async () => {
    expect(await toggleWatchlistAction("ZZZZ")).toMatchObject({ ok: false });
    expect(await placeOrderAction("AAPL", "short", 1)).toMatchObject({ ok: false });
    expect(await placeOrderAction("AAPL", "buy", "5")).toMatchObject({ ok: false });
    expect(await placeOrderAction({ symbol: "AAPL" }, "buy", 1)).toMatchObject({ ok: false });
    expect(accounts.toggleWatchlist).not.toHaveBeenCalled();
    expect(accounts.placeOrder).not.toHaveBeenCalled();
  });

  it("price orders from the server's data, with a server-made ID and time", async () => {
    accounts.placeOrder.mockResolvedValue({ ok: true, account: startingAccount(), trade: {} });
    // A tampered request can't name its own price: there's no argument for it.
    await placeOrderAction("AAPL", "buy", 2);
    const [userId, order] = accounts.placeOrder.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(order).toMatchObject({ symbol: "AAPL", side: "buy", shares: 2, price: 248.3 });
    expect(order.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("pass the rules' refusal back as a message", async () => {
    accounts.placeOrder.mockResolvedValue({ ok: false, error: "insufficient-cash", message: "You don't have enough cash for this order." });
    expect(await placeOrderAction("AAPL", "buy", 1000)).toEqual({ ok: false, message: "You don't have enough cash for this order." });
  });

  it("validate imported guest data and give its trades new IDs", async () => {
    expect(await importGuestAccountAction({ cash: "a lot" })).toMatchObject({ ok: false });
    expect(accounts.create).not.toHaveBeenCalled();

    accounts.create.mockResolvedValue(true);
    const guest = { ...startingAccount(), trades: [{ id: "someone-elses-id", symbol: "V", side: "buy", shares: 1, price: 348.1, time: 1 }] };
    await importGuestAccountAction(guest);
    const [userId, imported] = accounts.create.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(imported.trades[0].id).not.toBe("someone-elses-id");
  });

  it("refuse imports naming a stock that doesn't exist, or too many stocks", async () => {
    accounts.create.mockResolvedValue(true);
    expect(await importGuestAccountAction({ ...startingAccount(), watchlist: ["ZZZZ"] })).toMatchObject({ ok: false, message: expect.stringContaining("doesn't exist") });
    const many = Array.from({ length: 61 }, (_, i) => ({ id: `t${i}`, symbol: `S${i}`, side: "buy", shares: 1, price: 1, time: 1 }));
    expect(await importGuestAccountAction({ ...startingAccount(), trades: many })).toMatchObject({ ok: false });
    expect(accounts.create).not.toHaveBeenCalled();
  });

  it("watch any stock that exists, and explain a full watchlist", async () => {
    accounts.toggleWatchlist.mockResolvedValue(true);
    expect(await toggleWatchlistAction("KO")).toMatchObject({ ok: true });
    accounts.toggleWatchlist.mockResolvedValue("full");
    expect(await toggleWatchlistAction("V")).toMatchObject({ ok: false, message: expect.stringContaining("up to 30") });
  });

  it("explain when a stock's prices are unavailable instead of trading at a made-up price", async () => {
    expect(await placeOrderAction("KO", "buy", 1)).toMatchObject({ ok: false, message: expect.stringContaining("unavailable") });
    expect(accounts.placeOrder).not.toHaveBeenCalled();
  });

  it("won't import over an existing account", async () => {
    accounts.create.mockResolvedValue(false);
    expect(await importGuestAccountAction(startingAccount())).toMatchObject({ ok: false, message: expect.stringContaining("already") });
  });
});
