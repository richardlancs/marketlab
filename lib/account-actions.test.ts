// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startingAccount } from "./starting-account";

// The actions' collaborators are replaced with test doubles: the session
// lookup, the database, the market, and Next's request headers.
const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
const accounts = vi.hoisted(() => ({
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
vi.mock("./market", async () => ({
  STOCK_SYMBOLS: (await import("./market/universe")).STOCK_SYMBOLS,
  getStock: async (symbol: string) => (symbol === "AAPL" ? { symbol, price: 248.3 } : undefined),
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

  it("won't import over an existing account", async () => {
    accounts.create.mockResolvedValue(false);
    expect(await importGuestAccountAction(startingAccount())).toMatchObject({ ok: false, message: expect.stringContaining("already") });
  });
});
