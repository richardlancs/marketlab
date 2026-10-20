// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startingAccount } from "./starting-account";

// The actions' collaborators are replaced with test doubles: whose account it
// is (lib/owner.ts: the session or the guest cookie), the database and the market.
type FakeOwner = { id: string; kind: "user" | "guest"; pendingGuest: string | null };
const owner = vi.hoisted(() => ({ current: null as FakeOwner | null, saved: true, cleared: 0 }));
const accounts = vi.hoisted(() => ({
  load: vi.fn(),
  update: vi.fn(),
  ensure: vi.fn(),
  toggleWatchlist: vi.fn(),
  placeOrder: vi.fn(),
  reset: vi.fn(),
  replaceIfUntouched: vi.fn(),
}));
const guests = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("./owner", () => ({
  // Without `create`, a visitor who has saved nothing has no owner yet.
  currentOwner: async ({ create }: { create: boolean }) => (create || owner.saved ? owner.current : null),
  clearGuestCookie: async () => {
    owner.cleared++;
  },
}));
vi.mock("./db", () => ({ accounts, guests }));
vi.mock("./visitor-account", async () => ({ visitorAccount: async () => ({ ...(await import("./starting-account")).startingAccount(), processedThrough: 42 }) }));
// A fixed market, so prices don't depend on the date (or on Next's cache).
// AAPL and KO exist; KO's prices are unavailable right now.
const listing = (symbol: string) => (["AAPL", "KO", "V", "MSFT", "NVDA", "AMZN", "JPM", "TSLA", "META", "NFLX"].includes(symbol) ? { symbol, name: symbol, sector: null } : null);
vi.mock("./market", async () => ({
  getMarket: async () => ({ asOf: 42 }),
  getProcessingData: async () => ({ raw: {}, actions: {}, latest: 0 }),
  getListing: async (symbol: string) => listing(symbol),
  getStockDetail: async (symbol: string) =>
    symbol === "AAPL" ? { status: "ok", stock: { symbol, price: 248.3 } } : listing(symbol) ? { status: "unavailable", listing: listing(symbol) } : null,
}));

const { importBrowserAccountAction, placeOrderAction, processAccountAction, resetAccountAction, resolveGuestPortfolioAction, toggleWatchlistAction } = await import("./account-actions");

beforeEach(() => {
  vi.clearAllMocks();
  owner.current = { id: "user-1", kind: "user", pendingGuest: null };
  owner.saved = true;
  owner.cleared = 0;
  accounts.ensure.mockResolvedValue(startingAccount());
});

describe("account actions", () => {
  it("act on this browser's guest when signed out", async () => {
    owner.current = { id: "guest-1", kind: "guest", pendingGuest: null };
    await toggleWatchlistAction("AAPL");
    expect(accounts.toggleWatchlist).toHaveBeenCalledWith("guest-1", "AAPL");
  });

  it("don't create a guest just to catch up an account that was never saved", async () => {
    owner.saved = false;
    expect(await processAccountAction()).toEqual({ ok: true, account: { ...startingAccount(), processedThrough: 42 } });
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

  it("validate imported browser data and give its trades new IDs", async () => {
    expect(await importBrowserAccountAction({ cash: "a lot" })).toMatchObject({ ok: false });
    expect(accounts.replaceIfUntouched).not.toHaveBeenCalled();

    accounts.replaceIfUntouched.mockResolvedValue(true);
    const guest = { ...startingAccount(), trades: [{ id: "someone-elses-id", symbol: "V", side: "buy", shares: 1, price: 348.1, time: 1 }] };
    await importBrowserAccountAction(guest);
    const [userId, imported] = accounts.replaceIfUntouched.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(imported.trades[0].id).not.toBe("someone-elses-id");
  });

  it("refuse imports naming a stock that doesn't exist, or too many stocks", async () => {
    accounts.replaceIfUntouched.mockResolvedValue(true);
    expect(await importBrowserAccountAction({ ...startingAccount(), watchlist: ["ZZZZ"] })).toMatchObject({ ok: false, message: expect.stringContaining("doesn't exist") });
    const many = Array.from({ length: 61 }, (_, i) => ({ id: `t${i}`, symbol: `S${i}`, side: "buy", shares: 1, price: 1, time: 1 }));
    expect(await importBrowserAccountAction({ ...startingAccount(), trades: many })).toMatchObject({ ok: false });
    expect(accounts.replaceIfUntouched).not.toHaveBeenCalled();
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

  it("validate pending orders, alerts and reset presets before touching the database", async () => {
    const { placePendingOrderAction, addAlertAction } = await import("./account-actions");
    expect(await placePendingOrderAction({ symbol: "ZZZZ", side: "buy", type: "limit", shares: 1, price: 1, duration: "gtc" })).toEqual({ ok: false, message: "Unknown stock." });
    expect(await placePendingOrderAction("buy everything")).toMatchObject({ ok: false });
    expect(await addAlertAction({ symbol: "AAPL", direction: "sideways", price: 1 })).toMatchObject({ ok: false });
    expect(await resetAccountAction("cash1billion")).toMatchObject({ ok: false });
    expect(accounts.update).not.toHaveBeenCalled();
    expect(accounts.reset).not.toHaveBeenCalled();
  });

  it("run pending-order changes through the shared rules, on the up-to-date account", async () => {
    const { placePendingOrderAction } = await import("./account-actions");
    accounts.update.mockImplementation(async (_user: string, _market: unknown, fn: (a: unknown) => unknown) => fn(startingAccount()));
    const result = await placePendingOrderAction({ symbol: "AAPL", side: "buy", type: "limit", shares: 1, price: 200, duration: "day" });
    expect(result).toMatchObject({ ok: true, account: { orders: [{ symbol: "AAPL", type: "limit", status: "open" }] } });
    const tooBig = await placePendingOrderAction({ symbol: "AAPL", side: "buy", type: "limit", shares: 1000, price: 200, duration: "day" });
    expect(tooBig).toMatchObject({ ok: false, message: expect.stringContaining("cash") });
  });

  it("won't import over a portfolio of the owner's own", async () => {
    accounts.replaceIfUntouched.mockResolvedValue(false);
    expect(await importBrowserAccountAction(startingAccount())).toMatchObject({ ok: false, message: expect.stringContaining("already") });
  });

  it("settle a pending guest portfolio only for a signed-in user, then forget the guest", async () => {
    expect(await resolveGuestPortfolioAction("both")).toMatchObject({ ok: false });
    owner.current = { id: "guest-1", kind: "guest", pendingGuest: null };
    expect(await resolveGuestPortfolioAction("use-guest")).toMatchObject({ ok: false });
    owner.current = { id: "user-1", kind: "user", pendingGuest: "guest-9" };
    expect(await resolveGuestPortfolioAction("use-guest")).toMatchObject({ ok: true });
    expect(guests.resolve).toHaveBeenCalledWith("guest-9", "user-1", "use-guest");
    expect(owner.cleared).toBe(1);
  });
});
