/**
 * Reading and changing simulated accounts in the database, signed-in users'
 * and guests' alike (guests are users marked `isGuest`; see ./guests.ts).
 *
 * Every change runs as one write transaction (see ./transaction.ts) that reads the account, applies
 * the shared rules (lib/trading.ts, lib/orders.ts, lib/processing.ts), and writes
 * what changed. So two orders sent at once (say, from two tabs) can't both spend the same cash:
 * the second waits for the first, then sees its result. And because the account is brought up to
 * date (dividends, fills…) inside the same transaction as each trade, nothing can be applied twice.
 *
 * This takes the database as a parameter so tests can use an in-memory one.
 * App code uses the instance from ./index.ts, which is server-only.
 */
import { and, count, desc, eq, getTableColumns, inArray, max, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { processAccount, type MarketData } from "../processing";
import { isStartingAccount, startingAccount, type StartingPreset } from "../starting-account";
import { placeOptionOrder, type OptionOrder } from "../option-trading";
import { MAX_ALERTS, MAX_EVENTS, MAX_TRADES, MAX_WATCHLIST, placeOrder, type Account, type Marks, type OptionPosition, type Order, type PendingOrder, type Trade, type TradeResult } from "../trading";
import * as schema from "./schema";
import { writeTransaction, type Executor } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;

const { portfolio, holding, watchlistItem, trade, accountEvent, pendingOrder, priceAlert, optionPosition } = schema;

// SQLite numbers every row in insertion order (the hidden `rowid`). Holdings
// are listed in the order they were first bought, like lib/trading.ts does:
// an update keeps a row's rowid, and selling out then rebuying appends it.
const insertionOrder = sql`rowid`;

/** Drops the user column and null columns, so a row reads back exactly like the object that was saved. */
const defined = <T extends Record<string, unknown>>(row: T) =>
  Object.fromEntries(Object.entries(row).filter(([k, v]) => k !== "userId" && v !== null && v !== undefined)) as { [K in Exclude<keyof T, "userId">]: Exclude<T[K], null> };

type OrderRow = typeof pendingOrder.$inferSelect;
type TradeRow = typeof trade.$inferSelect;

/** An order as the account holds it: the trail and bracket columns become objects. */
function orderOf(row: OrderRow): PendingOrder {
  const { trailKind, trailValue, bracketStop, bracketTarget, short, ...rest } = row;
  return {
    ...defined(rest),
    ...(short && { short: true }),
    ...(trailKind !== null && trailValue !== null && { trail: { kind: trailKind, value: trailValue } }),
    ...((bracketStop !== null || bracketTarget !== null) && { bracket: { ...(bracketStop !== null && { stop: bracketStop }), ...(bracketTarget !== null && { target: bracketTarget }) } }),
  } as PendingOrder;
}

/** Every column of an order row; optional ones null when absent, so a cleared field is cleared in the row too. */
function orderRow(o: PendingOrder) {
  const { trail, bracket, short, ...rest } = o;
  return {
    closedAt: null,
    fillPrice: null,
    note: null,
    reason: null,
    tradeNote: null,
    extreme: null,
    ocoGroup: null,
    ...rest,
    short: short ?? null,
    trailKind: trail?.kind ?? null,
    trailValue: trail?.value ?? null,
    bracketStop: bracket?.stop ?? null,
    bracketTarget: bracket?.target ?? null,
  };
}

function tradeOf({ id, symbol, side, shares, price, time, realizedGain, reason, note, optionKind, strike, expiry }: TradeRow): Trade {
  return {
    id,
    symbol,
    side,
    shares,
    price,
    time,
    ...(realizedGain !== null && { realizedGain }),
    ...(optionKind !== null && strike !== null && expiry !== null && { option: { kind: optionKind, strike, expiry } }),
    ...(reason !== null && { reason }),
    ...(note !== null && { note }),
  };
}

const tradeRow = (userId: string, { option, ...t }: Trade) => ({
  userId,
  ...t,
  realizedGain: t.realizedGain ?? null,
  optionKind: option?.kind ?? null,
  strike: option?.strike ?? null,
  expiry: option?.expiry ?? null,
});

const optionRow = (userId: string, o: OptionPosition) => ({ userId, mark: null, markedAt: null, delta: null, ...o });

async function read(ex: Executor, userId: string): Promise<Account | null> {
  const [row] = await ex.select().from(portfolio).where(eq(portfolio.userId, userId));
  if (!row) return null;
  const [holdings, watchlist, trades, events, orders, alerts, options] = await Promise.all([
    ex.select().from(holding).where(eq(holding.userId, userId)).orderBy(insertionOrder),
    ex.select().from(watchlistItem).where(eq(watchlistItem.userId, userId)).orderBy(watchlistItem.position),
    ex.select().from(trade).where(eq(trade.userId, userId)).orderBy(desc(trade.time), desc(insertionOrder)).limit(MAX_TRADES),
    ex.select().from(accountEvent).where(eq(accountEvent.userId, userId)).orderBy(desc(accountEvent.time)).limit(MAX_EVENTS),
    ex.select().from(pendingOrder).where(eq(pendingOrder.userId, userId)).orderBy(desc(pendingOrder.createdAt)),
    ex.select().from(priceAlert).where(eq(priceAlert.userId, userId)).orderBy(desc(priceAlert.createdAt)).limit(MAX_ALERTS),
    ex.select().from(optionPosition).where(eq(optionPosition.userId, userId)).orderBy(optionPosition.expiry, optionPosition.id),
  ]);
  const openFirst = [...orders.filter((o) => o.status === "open"), ...orders.filter((o) => o.status !== "open").sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))];
  return {
    cash: row.cash,
    holdings: holdings.map(({ symbol, shares, averageCost }) => ({ symbol, shares, averageCost })),
    watchlist: watchlist.map((w) => w.symbol),
    trades: trades.map(tradeOf),
    // Phase 7 fields, only when there's something in them (as guest accounts store them).
    ...(events.length && { events: events.map(defined) }),
    ...(orders.length && { orders: openFirst.map(orderOf) }),
    // emailedAt is the alert emails' bookkeeping (lib/alert-emails.ts), not part of the account.
    ...(alerts.length && {
      alerts: alerts.map(({ seen, ...a }) => {
        const { emailedAt, ...rest } = defined(a);
        void emailedAt;
        return { ...rest, ...(seen && { seen }) };
      }),
    }),
    ...(options.length && { options: options.map((o) => defined(o) as OptionPosition) }),
    ...(row.processedThrough !== null && { processedThrough: row.processedThrough }),
  };
}

async function write(ex: Executor, userId: string, account: Account) {
  await ex.insert(portfolio).values({ userId, cash: account.cash, processedThrough: account.processedThrough ?? null });
  if (account.holdings.length) await ex.insert(holding).values(account.holdings.map((h) => ({ userId, ...h })));
  if (account.watchlist.length) await ex.insert(watchlistItem).values(account.watchlist.map((symbol, position) => ({ userId, symbol, position })));
  if (account.trades.length) await ex.insert(trade).values(account.trades.map((t) => tradeRow(userId, t)));
  if (account.events?.length) await ex.insert(accountEvent).values(account.events.map((e) => ({ userId, ...e })));
  if (account.orders?.length) await ex.insert(pendingOrder).values(account.orders.map((o) => ({ userId, ...orderRow(o) })));
  if (account.options?.length) await ex.insert(optionPosition).values(account.options.map((o) => optionRow(userId, o)));
  if (account.alerts?.length) await ex.insert(priceAlert).values(account.alerts.map((a) => ({ userId, ...a, seen: a.seen ?? false })));
}

async function remove(ex: Executor, userId: string) {
  for (const table of [trade, watchlistItem, holding, accountEvent, pendingOrder, priceAlert, optionPosition]) await ex.delete(table).where(eq(table.userId, userId));
  await ex.delete(portfolio).where(eq(portfolio.userId, userId));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Saves what changed between two versions of an account: new rows inserted, changed rows updated, dropped rows deleted. */
async function persist(ex: Executor, userId: string, before: Account, after: Account) {
  if (before.cash !== after.cash || before.processedThrough !== after.processedThrough) {
    await ex.update(portfolio).set({ cash: after.cash, processedThrough: after.processedThrough ?? null }).where(eq(portfolio.userId, userId));
  }
  if (!same(before.holdings, after.holdings)) {
    // Rewritten in order, so the insertion order (and the holdings' order) is kept.
    await ex.delete(holding).where(eq(holding.userId, userId));
    if (after.holdings.length) await ex.insert(holding).values(after.holdings.map((h) => ({ userId, ...h })));
  }
  if (!same(before.watchlist, after.watchlist)) {
    await ex.delete(watchlistItem).where(eq(watchlistItem.userId, userId));
    if (after.watchlist.length) await ex.insert(watchlistItem).values(after.watchlist.map((symbol, position) => ({ userId, symbol, position })));
  }
  const oldTrades = new Set(before.trades.map((t) => t.id));
  const newTrades = after.trades.filter((t) => !oldTrades.has(t.id));
  if (newTrades.length) await ex.insert(trade).values(newTrades.map((t) => tradeRow(userId, t)));
  // A reason or note added to (or changed on) a past trade: the only change a kept trade can have.
  const annotations = new Map(before.trades.map((t) => [t.id, [t.reason, t.note]]));
  for (const t of after.trades) {
    const was = annotations.get(t.id);
    if (was && (was[0] !== t.reason || was[1] !== t.note)) {
      await ex.update(trade).set({ reason: t.reason ?? null, note: t.note ?? null }).where(and(eq(trade.userId, userId), eq(trade.id, t.id)));
    }
  }
  const oldEvents = new Map((before.events ?? []).map((e) => [e.id, e]));
  const newEvents = (after.events ?? []).filter((e) => !oldEvents.has(e.id));
  if (newEvents.length) await ex.insert(accountEvent).values(newEvents.map((e) => ({ userId, ...e })));
  // A month's borrow fee grows at each close: the one kind of event that changes.
  for (const e of after.events ?? []) {
    const was = oldEvents.get(e.id);
    if (was && !same(was, e)) await ex.update(accountEvent).set({ time: e.time, shares: e.shares, cash: e.cash }).where(and(eq(accountEvent.userId, userId), eq(accountEvent.id, e.id)));
  }
  if (!same(before.options ?? [], after.options ?? [])) {
    await ex.delete(optionPosition).where(eq(optionPosition.userId, userId));
    if (after.options?.length) await ex.insert(optionPosition).values(after.options.map((o) => optionRow(userId, o)));
  }

  // Orders and alerts: every new or changed one in a single upsert, and the dropped ones in a single delete,
  // rather than a statement (a round trip, on Turso) per row.
  const sync = async <T extends { id: string }>(
    table: typeof pendingOrder | typeof priceAlert,
    was: T[] = [],
    now: T[] = [],
    toRow: (item: T) => Record<string, unknown>,
  ) => {
    const previous = new Map(was.map((x) => [x.id, x]));
    const changed = now.filter((item) => !previous.has(item.id) || !same(previous.get(item.id), item));
    if (changed.length) {
      const rows = changed.map((item) => ({ userId, ...toRow(item) }));
      // Overwrite the columns this code writes (not, say, the alert emails' emailed_at), and only the user's own rows.
      const columns = getTableColumns(table) as Record<string, { name: string }>;
      const written = Object.keys(rows[0]).filter((key) => key !== "id" && key !== "userId" && key in columns);
      const set = Object.fromEntries(written.map((key) => [key, sql.raw(`excluded.${columns[key].name}`)]));
      await ex
        .insert(table)
        .values(rows as never)
        .onConflictDoUpdate({ target: table.id, set: set as never, setWhere: sql`${table.userId} = excluded.user_id` });
    }
    const kept = new Set(now.map((x) => x.id));
    const dropped = was.filter((x) => !kept.has(x.id)).map((x) => x.id);
    if (dropped.length) await ex.delete(table).where(and(eq(table.userId, userId), inArray(table.id, dropped)));
  };
  // Optional fields default to null, so a field that was cleared is cleared in the row too.
  await sync(pendingOrder, before.orders, after.orders, orderRow);
  await sync(priceAlert, before.alerts, after.alerts, (a) => ({ triggeredAt: null, triggerPrice: null, condition: null, ...a, seen: a.seen ?? false }));
}

/** The account tables, keyed by user: the rows `moveAccount` hands from one user to another. */
const ACCOUNT_TABLES = [portfolio, holding, watchlistItem, trade, accountEvent, pendingOrder, priceAlert, optionPosition] as const;

/**
 * Hands every row of one user's account to another (a guest's portfolio
 * becoming their new account's). The receiving user must have no account.
 * For use inside a transaction that's doing more (lib/db/guests.ts).
 */
export async function moveAccount(ex: Executor, fromUserId: string, toUserId: string) {
  for (const table of ACCOUNT_TABLES) await ex.update(table).set({ userId: toUserId }).where(eq(table.userId, fromUserId));
}

export { read as readAccount, remove as removeAccount, write as writeAccount };

/** Loads the account, creating it from the starting account if this user has none yet. */
async function ensure(ex: Executor, userId: string): Promise<Account> {
  const existing = await read(ex, userId);
  if (existing) return existing;
  const fresh = startingAccount();
  await write(ex, userId, fresh);
  return fresh;
}

/** Each symbol's latest close in the processing data: what short positions are valued at. */
export function latestMarks(market: MarketData): Marks {
  const marks: Marks = {};
  for (const [symbol, points] of Object.entries(market.raw)) {
    const last = points.filter((p) => p.time <= market.latest).at(-1);
    if (last) marks[symbol] = last.price;
  }
  return marks;
}

export type ChangeResult<T> = { ok: true; account: Account; value?: T } | { ok: false; message: string };

export function createAccountRepository(db: Db) {
  const transaction = <T>(fn: (tx: Executor) => Promise<T>) => writeTransaction(db, fn);

  /**
   * The general way to change an account: in one transaction, read it, bring
   * it up to date with `market` (if given), apply `change`, and save the
   * difference. A refusal saves only the bringing up to date.
   */
  const update = <T = undefined>(userId: string, market: MarketData | null, change: (account: Account) => ChangeResult<T>) =>
    transaction(async (tx): Promise<ChangeResult<T>> => {
      const before = await ensure(tx, userId);
      const processed = market ? processAccount(before, market) : before;
      const result = change(processed);
      await persist(tx, userId, before, result.ok ? result.account : processed);
      return result;
    });

  return {
    /** The user's account, or null if they haven't got one yet. */
    load: (userId: string) => read(db, userId),

    /**
     * Users whose account hasn't been brought up to `latest` (the market's
     * latest close), longest-waiting first: what the daily job catches up.
     */
    async listBehind(latest: number, limit: number): Promise<string[]> {
      const rows = await db
        .select({ userId: portfolio.userId })
        .from(portfolio)
        .where(
          sql`(${portfolio.processedThrough} is null or ${portfolio.processedThrough} < ${latest})
              -- A finished season's portfolio is frozen: nothing more to process.
              and ${portfolio.userId} not in (select e.account_id from season_entry e join season s on s.id = e.season_id where s.closed_at is not null)`,
        )
        // SQLite sorts NULL (never processed) first, then oldest: the index's own order, so no sort step and it stops at `limit`.
        .orderBy(portfolio.processedThrough)
        .limit(limit);
      return rows.map((r) => r.userId);
    },

    /** The user's account, created from the starting account if needed. */
    ensure: (userId: string) => transaction((tx) => ensure(tx, userId)),

    update,

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

    /**
     * Replaces the account with `account` (one being imported from this
     * browser's old local storage), but only if the user has no account yet
     * or only the untouched starting one. Returns false, changing nothing,
     * if they already have a portfolio of their own.
     */
    replaceIfUntouched: (userId: string, account: Account) =>
      transaction(async (tx) => {
        const existing = await read(tx, userId);
        if (existing && !isStartingAccount(existing)) return false;
        await remove(tx, userId);
        await write(tx, userId, account);
        return true;
      }),

    /**
     * Brings the account up to date, then applies an order with the shared rules, saving the result if it's allowed.
     * `then` can add to a filled order (its bracket's orders) in the same transaction.
     */
    placeOrder: async (userId: string, order: Order, market: MarketData | null = null, then?: (account: Account) => Account): Promise<TradeResult> => {
      let outcome: TradeResult = { ok: false, error: "invalid-price", message: "That order couldn't be placed." };
      await update(userId, market, (account) => {
        outcome = placeOrder(account, order, market ? latestMarks(market) : undefined);
        if (outcome.ok && then) outcome = { ...outcome, account: then(outcome.account) };
        return outcome.ok ? { ok: true, account: outcome.account } : { ok: false, message: outcome.message };
      });
      return outcome;
    },

    /** Brings the account up to date, then applies an option order. */
    placeOptionOrder: async (userId: string, order: OptionOrder, market: MarketData | null = null): Promise<TradeResult> => {
      let outcome: TradeResult = { ok: false, error: "invalid-price", message: "That order couldn't be placed." };
      await update(userId, market, (account) => {
        outcome = placeOptionOrder(account, order);
        return outcome.ok ? { ok: true, account: outcome.account } : { ok: false, message: outcome.message };
      });
      return outcome;
    },

    /** Stores the analytics service's latest values for option positions (the mark, its close and delta), by contract id. */
    async setOptionMarks(userId: string, marks: { id: string; mark: number; markedAt: number; delta: number | null }[]) {
      for (const m of marks) {
        await db
          .update(optionPosition)
          .set({ mark: m.mark, markedAt: m.markedAt, delta: m.delta })
          .where(and(eq(optionPosition.userId, userId), eq(optionPosition.id, m.id)));
      }
    },

    /** Adds the symbol to the end of the watchlist, or removes it. Returns whether it's now watched, or "full". */
    toggleWatchlist: (userId: string, symbol: string) =>
      transaction(async (tx) => {
        await ensure(tx, userId);
        const where = and(eq(watchlistItem.userId, userId), eq(watchlistItem.symbol, symbol));
        const [existing] = await tx.select().from(watchlistItem).where(where);
        if (existing) {
          await tx.delete(watchlistItem).where(where);
          return false;
        }
        const [{ last, total }] = await tx
          .select({ last: max(watchlistItem.position), total: count() })
          .from(watchlistItem)
          .where(eq(watchlistItem.userId, userId));
        if (total >= MAX_WATCHLIST) return "full" as const;
        await tx.insert(watchlistItem).values({ userId, symbol, position: (last ?? -1) + 1 });
        return true;
      }),

    /** Replaces the account with a starting account. */
    reset: (userId: string, preset: StartingPreset = "starter") =>
      transaction(async (tx) => {
        await remove(tx, userId);
        await write(tx, userId, startingAccount(preset));
      }),
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;
