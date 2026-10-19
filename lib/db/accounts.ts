/**
 * Reading and changing signed-in users' simulated accounts in the database.
 *
 * Every change runs as one write transaction that reads the account, applies
 * the same rules guest mode uses (lib/trading.ts), and writes the result. So
 * two orders sent at once (say, from two tabs) can't both spend the same cash:
 * the second waits for the first, then sees its result.
 *
 * This takes the database as a parameter so tests can use an in-memory one.
 * App code uses the instance from ./index.ts, which is server-only.
 */
import { and, desc, eq, max, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { startingAccount } from "../starting-account";
import { MAX_TRADES, placeOrder, type Account, type Order, type TradeResult } from "../trading";
import * as schema from "./schema";

type Db = LibSQLDatabase<typeof schema>;
/** A transaction, or the database itself: both can run queries. */
type Executor = Pick<Db, "select" | "insert" | "update" | "delete">;

const { portfolio, holding, watchlistItem, trade } = schema;

// SQLite numbers every row in insertion order (the hidden `rowid`). Holdings
// are listed in the order they were first bought, like lib/trading.ts does:
// an update keeps a row's rowid, and selling out then rebuying appends it.
const insertionOrder = sql`rowid`;

async function read(ex: Executor, userId: string): Promise<Account | null> {
  const [row] = await ex.select().from(portfolio).where(eq(portfolio.userId, userId));
  if (!row) return null;
  const [holdings, watchlist, trades] = await Promise.all([
    ex.select().from(holding).where(eq(holding.userId, userId)).orderBy(insertionOrder),
    ex.select().from(watchlistItem).where(eq(watchlistItem.userId, userId)).orderBy(watchlistItem.position),
    ex.select().from(trade).where(eq(trade.userId, userId)).orderBy(desc(trade.time), desc(insertionOrder)).limit(MAX_TRADES),
  ]);
  return {
    cash: row.cash,
    holdings: holdings.map(({ symbol, shares, averageCost }) => ({ symbol, shares, averageCost })),
    watchlist: watchlist.map((w) => w.symbol),
    trades: trades.map(({ id, symbol, side, shares, price, time, realizedGain }) => ({
      id,
      symbol,
      side,
      shares,
      price,
      time,
      ...(realizedGain !== null && { realizedGain }),
    })),
  };
}

async function write(ex: Executor, userId: string, account: Account) {
  await ex.insert(portfolio).values({ userId, cash: account.cash });
  if (account.holdings.length) await ex.insert(holding).values(account.holdings.map((h) => ({ userId, ...h })));
  if (account.watchlist.length) await ex.insert(watchlistItem).values(account.watchlist.map((symbol, position) => ({ userId, symbol, position })));
  if (account.trades.length) await ex.insert(trade).values(account.trades.map((t) => ({ userId, ...t, realizedGain: t.realizedGain ?? null })));
}

async function remove(ex: Executor, userId: string) {
  await ex.delete(trade).where(eq(trade.userId, userId));
  await ex.delete(watchlistItem).where(eq(watchlistItem.userId, userId));
  await ex.delete(holding).where(eq(holding.userId, userId));
  await ex.delete(portfolio).where(eq(portfolio.userId, userId));
}

/** Loads the account, creating it from the starting account if this user has none yet. */
async function ensure(ex: Executor, userId: string): Promise<Account> {
  const existing = await read(ex, userId);
  if (existing) return existing;
  const fresh = startingAccount();
  await write(ex, userId, fresh);
  return fresh;
}

export function createAccountRepository(db: Db) {
  // Write transactions run one at a time within this server process: each waits
  // for the previous one to finish. Local SQLite needs this because its driver
  // is synchronous. A transaction waiting for the file's lock would block the
  // whole event loop, including the transaction that holds the lock. (Turso
  // queues transactions on its side, so this costs nothing there.)
  let queue: Promise<unknown> = Promise.resolve();
  const transaction = <T>(fn: (tx: Executor) => Promise<T>): Promise<T> => {
    // "immediate" takes the write lock at the start, so the read inside each
    // transaction can't go stale before its write.
    const run = queue.then(() => db.transaction(fn, { behavior: "immediate" }));
    queue = run.catch(() => {}); // one failed transaction mustn't block the next
    return run;
  };

  return {
    /** The user's account, or null if they haven't got one yet. */
    load: (userId: string) => read(db, userId),

    /** The user's account, created from the starting account if needed. */
    ensure: (userId: string) => transaction((tx) => ensure(tx, userId)),

    /**
     * Creates the account from `account` (a guest account being imported).
     * Returns false, changing nothing, if the user already has one.
     */
    create: (userId: string, account: Account) =>
      transaction(async (tx) => {
        if (await read(tx, userId)) return false;
        await write(tx, userId, account);
        return true;
      }),

    /** Applies an order with the shared rules, and saves the result if it's allowed. */
    placeOrder: (userId: string, order: Order): Promise<TradeResult> =>
      transaction(async (tx) => {
        const result = placeOrder(await ensure(tx, userId), order);
        if (!result.ok) return result;

        const { account, trade: filled } = result;
        await tx.update(portfolio).set({ cash: account.cash }).where(eq(portfolio.userId, userId));
        const after = account.holdings.find((h) => h.symbol === filled.symbol);
        const where = and(eq(holding.userId, userId), eq(holding.symbol, filled.symbol));
        if (!after) await tx.delete(holding).where(where);
        else
          await tx
            .insert(holding)
            .values({ userId, ...after })
            .onConflictDoUpdate({ target: [holding.userId, holding.symbol], set: { shares: after.shares, averageCost: after.averageCost } });
        await tx.insert(trade).values({ userId, ...filled, realizedGain: filled.realizedGain ?? null });
        return result;
      }),

    /** Adds the symbol to the end of the watchlist, or removes it. Returns whether it's now watched. */
    toggleWatchlist: (userId: string, symbol: string) =>
      transaction(async (tx) => {
        await ensure(tx, userId);
        const where = and(eq(watchlistItem.userId, userId), eq(watchlistItem.symbol, symbol));
        const [existing] = await tx.select().from(watchlistItem).where(where);
        if (existing) {
          await tx.delete(watchlistItem).where(where);
          return false;
        }
        const [{ last }] = await tx.select({ last: max(watchlistItem.position) }).from(watchlistItem).where(eq(watchlistItem.userId, userId));
        await tx.insert(watchlistItem).values({ userId, symbol, position: (last ?? -1) + 1 });
        return true;
      }),

    /** Replaces the account with the starting account. */
    reset: (userId: string) =>
      transaction(async (tx) => {
        await remove(tx, userId);
        await write(tx, userId, startingAccount());
      }),
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;
