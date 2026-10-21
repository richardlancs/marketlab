// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startingAccount } from "../starting-account";
import type { Account, Order } from "../trading";
import { createAccountRepository, type AccountRepository } from "./accounts";
import * as schema from "./schema";

// A real SQLite file in a temp folder, migrated with the app's own migrations.
// (Not ":memory:": libSQL opens a new connection per transaction, and each
// in-memory connection would be a different, empty database.)
let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let repo: AccountRepository;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-db-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  repo = createAccountRepository(db);
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

let userId: string;
let n = 0;
beforeEach(async () => {
  userId = `user-${++n}`;
  await db.insert(schema.user).values({ id: userId, name: "Test", email: `${userId}@example.com` });
});

const order = (side: Order["side"], symbol: string, shares: number, price: number): Order => ({
  side,
  symbol,
  shares,
  price,
  id: `${userId}-t${++n}`,
  time: 1_760_000_000_000 + n,
});

describe("account repository", () => {
  it("has no account until one is created", async () => {
    expect(await repo.load(userId)).toBeNull();
    expect(await repo.ensure(userId)).toEqual(startingAccount());
    expect(await repo.load(userId)).toEqual(startingAccount());
  });

  it("imports an account once, and never over an existing one", async () => {
    const guest: Account = {
      cash: 5000.5,
      holdings: [{ symbol: "TSLA", shares: 3, averageCost: 410.25 }],
      watchlist: ["V", "AAPL"],
      trades: [{ id: "g1", symbol: "TSLA", side: "buy", shares: 3, price: 410.25, time: 1 }],
    };
    expect(await repo.create(userId, guest)).toBe(true);
    expect(await repo.load(userId)).toEqual(guest);
    expect(await repo.create(userId, startingAccount())).toBe(false);
    expect(await repo.load(userId)).toEqual(guest);
  });

  it("saves a buy and a sell the same way the rules compute them", async () => {
    await repo.ensure(userId);
    const bought = await repo.placeOrder(userId, order("buy", "AAPL", 10, 200));
    expect(bought.ok).toBe(true);
    const sold = await repo.placeOrder(userId, order("sell", "AAPL", 50, 250));
    expect(sold.ok).toBe(true);

    const saved = await repo.load(userId);
    // Whatever the rules returned is exactly what was stored.
    expect(saved).toEqual(sold.ok && sold.account);
    expect(saved?.holdings.find((h) => h.symbol === "AAPL")).toBeUndefined(); // 40 + 10 bought, 50 sold
    expect(saved?.trades.map((t) => t.side)).toEqual(["sell", "buy"]);
  });

  it("refuses an order the rules refuse, and changes nothing", async () => {
    const before = await repo.ensure(userId);
    const result = await repo.placeOrder(userId, order("buy", "NFLX", 1000, 1184.5));
    expect(result).toMatchObject({ ok: false, error: "insufficient-cash" });
    expect(await repo.load(userId)).toEqual(before);
  });

  it("can't spend the same cash twice when orders arrive at once", async () => {
    await repo.ensure(userId);
    // Each order alone is affordable ($12,450 cash); together they aren't.
    const results = await Promise.all([
      repo.placeOrder(userId, order("buy", "MSFT", 20, 500)),
      repo.placeOrder(userId, order("buy", "MSFT", 20, 500)),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await repo.load(userId))?.cash).toBe(2450);
  });

  it("toggles the watchlist, keeping the order symbols were added in", async () => {
    await repo.ensure(userId);
    expect(await repo.toggleWatchlist(userId, "V")).toBe(true);
    expect(await repo.toggleWatchlist(userId, "AAPL")).toBe(false);
    expect((await repo.load(userId))?.watchlist).toEqual(["NVDA", "TSLA", "META", "NFLX", "V"]);
  });

  it("refuses to watch more than the limit, but still lets a stock be removed", async () => {
    await repo.ensure(userId);
    // The starting watchlist has 5; fill it to 30 with any stocks (KO, BRK-B…: not just the core ones).
    for (let i = 0; i < 25; i++) expect(await repo.toggleWatchlist(userId, `S${i}`)).toBe(true);
    expect(await repo.toggleWatchlist(userId, "KO")).toBe("full");
    expect(await repo.toggleWatchlist(userId, "S0")).toBe(false);
    expect(await repo.toggleWatchlist(userId, "BRK-B")).toBe(true);
    expect((await repo.load(userId))?.watchlist).toHaveLength(30);
  });

  it("resets to the starting account", async () => {
    await repo.ensure(userId);
    await repo.placeOrder(userId, order("buy", "V", 1, 348.1));
    await repo.toggleWatchlist(userId, "JPM");
    await repo.reset(userId);
    expect(await repo.load(userId)).toEqual(startingAccount());
  });

  it("keeps users' accounts apart", async () => {
    const other = `${userId}-other`;
    await db.insert(schema.user).values({ id: other, name: "Other", email: `${other}@example.com` });
    await repo.ensure(userId);
    await repo.ensure(other);
    await repo.placeOrder(userId, order("buy", "V", 1, 348.1));
    expect(await repo.load(other)).toEqual(startingAccount());
  });

  it("deletes a user's account with the user", async () => {
    await repo.ensure(userId);
    await db.delete(schema.user).where((await import("drizzle-orm")).eq(schema.user.id, userId));
    expect(await repo.load(userId)).toBeNull();
  });

  it("saves dividends, orders and alerts, and reads them back exactly", async () => {
    await repo.ensure(userId);
    const day = (d: number) => 1_760_000_000_000 + d * 86_400_000;
    const market = (latest: number) => ({
      raw: {
        // Every stock the account holds needs prices, or processing waits for them.
        ...Object.fromEntries(["MSFT", "NVDA", "AMZN", "JPM", "KO"].map((s) => [s, [1, 2, 3].map((d) => ({ time: day(d), price: 60 }))])),
        AAPL: [1, 2, 3].map((d) => ({ time: day(d), price: 200 - d })),
      },
      actions: { AAPL: [{ symbol: "AAPL", time: day(2), kind: "dividend" as const, amount: 0.25 }] },
      latest,
    });
    // The first processing only starts tracking.
    await repo.update(userId, market(day(0)), (a) => ({ ok: true, account: a }));
    const { placePendingOrder } = await import("../orders");
    const { addAlert } = await import("../alerts");
    await repo.update(userId, null, (a) => {
      const placed = placePendingOrder(a, { symbol: "AAPL", side: "buy", type: "limit", shares: 2, price: 198.5, duration: "gtc" }, `${userId}-o1`, day(0) + 1);
      if (!placed.ok) return placed;
      const alerted = addAlert(placed.account, { symbol: "KO", direction: "above", price: 59 }, `${userId}-a1`, day(0) + 1);
      if (!alerted.ok) return alerted;
      // An indicator alert too: its condition is stored as JSON and must read back the same.
      const indicator = addAlert(alerted.account, { symbol: "MSFT", direction: "above", price: 60, condition: { kind: "sma-cross", days: 50 } }, `${userId}-a2`, day(0) + 2);
      return indicator.ok ? { ok: true, account: indicator.account } : indicator;
    });
    const result = await repo.update(userId, market(day(3)), (a) => ({ ok: true, account: a }));
    if (!result.ok) throw new Error(result.message);
    const saved = await repo.load(userId);
    expect(saved).toEqual(result.account);
    expect(saved?.events?.[0]).toMatchObject({ kind: "dividend", shares: 40, cash: 10 });
    expect(saved?.orders?.[0]).toMatchObject({ status: "filled", fillPrice: 198 });
    expect(saved?.alerts?.find((a) => a.id === `${userId}-a1`)).toMatchObject({ triggeredAt: day(1) });
    expect(saved?.alerts?.find((a) => a.id === `${userId}-a2`)).toMatchObject({ condition: { kind: "sma-cross", days: 50 } });
    expect(saved?.trades[0]).toMatchObject({ id: `${userId}-o1`, shares: 2, price: 198 });
    // Processing again (another tab, a retry) changes nothing.
    await repo.update(userId, market(day(3)), (a) => ({ ok: true, account: a }));
    expect(await repo.load(userId)).toEqual(saved);
  });

  it("resets to a cash-only start", async () => {
    await repo.ensure(userId);
    await repo.reset(userId, "cash25k");
    expect(await repo.load(userId)).toEqual(startingAccount("cash25k"));
  });
});
