/**
 * A person's own data, as a whole: everything MarketLab keeps about one user
 * (signed in or a guest), to download (`exportAll`), to erase by kind while
 * keeping the account (`erase`, kinds in lib/profile.ts), or to erase
 * entirely before the account itself goes (`eraseEverything`, run from
 * Better Auth's beforeDelete in lib/auth.ts, which then deletes the user,
 * its sessions and sign-in methods). Plus profile pictures.
 *
 * Rows are deleted explicitly rather than left to the foreign keys' cascade,
 * like the guest cleanup (./guests.ts): nothing depends on SQLite's
 * foreign_keys setting. A new per-user table must be added here, to
 * USER_TABLES below, or the test in personal-data.test.ts fails.
 */
import { and, eq, inArray, lt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { startingAccount } from "../starting-account";
import type { AvatarType, DataKind } from "../profile";
import { deleteLearnerOf } from "./learning";
import { deleteDevicesOf } from "./push";
import * as schema from "./schema";
import { writeTransaction, type Executor } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;

const {
  user,
  session,
  account,
  verification,
  portfolio,
  holding,
  watchlistItem,
  trade,
  backtestRun,
  accountEvent,
  portfolioValue,
  pendingOrder,
  optionPosition,
  priceAlert,
  leaderboardEntry,
  learner,
  lessonProgress,
  emailPreference,
  pushSubscription,
  seasonEntry,
  seasonStanding,
  badge,
  avatar,
} = schema;

/**
 * Every table with rows that belong to one user, by their user ID (or, for
 * season standings, a season account's ID). The test checks this against
 * the schema, so a table added later can't be forgotten.
 */
export const USER_TABLES = [
  "session",
  "account",
  "portfolio",
  "holding",
  "watchlist_item",
  "trade",
  "backtest_run",
  "account_event",
  "portfolio_value",
  "pending_order",
  "option_position",
  "price_alert",
  "leaderboard_entry",
  "learner",
  "email_preference",
  "push_subscription",
  "season_entry",
  "season_standing",
  "badge",
  "avatar",
] as const;

/** The practice portfolio's own rows (not the watchlist and alerts, which are their own kind). */
const PORTFOLIO_TABLES = [holding, trade, accountEvent, pendingOrder, optionPosition, portfolioValue] as const;

/** Starts the portfolio again from the starter portfolio, keeping the watchlist and alerts. */
async function restartPortfolio(ex: Executor, userId: string) {
  for (const table of PORTFOLIO_TABLES) await ex.delete(table).where(eq(table.userId, userId));
  const [row] = await ex.select({ userId: portfolio.userId }).from(portfolio).where(eq(portfolio.userId, userId));
  if (!row) return; // no portfolio saved yet: it starts fresh anyway
  const fresh = startingAccount("starter");
  await ex.update(portfolio).set({ cash: fresh.cash, processedThrough: null }).where(eq(portfolio.userId, userId));
  if (fresh.holdings.length) await ex.insert(holding).values(fresh.holdings.map((h) => ({ userId, ...h })));
  // Its history is gone, so a return measured from when they joined would be meaningless.
  await ex.delete(leaderboardEntry).where(eq(leaderboardEntry.userId, userId));
}

/** Deletes one hidden season account (user.season_of) with everything it holds. */
async function deleteSeasonAccount(ex: Executor, accountId: string) {
  for (const table of [...PORTFOLIO_TABLES, watchlistItem, priceAlert]) await ex.delete(table).where(eq(table.userId, accountId));
  await ex.delete(portfolio).where(eq(portfolio.userId, accountId));
  await ex.delete(seasonStanding).where(eq(seasonStanding.accountId, accountId));
  await ex.delete(seasonEntry).where(eq(seasonEntry.accountId, accountId));
  await ex.delete(user).where(eq(user.id, accountId));
}

async function eraseCommunity(ex: Executor, userId: string) {
  await ex.delete(leaderboardEntry).where(eq(leaderboardEntry.userId, userId));
  const seasonAccounts = await ex.select({ id: user.id }).from(user).where(eq(user.seasonOf, userId));
  for (const { id } of seasonAccounts) await deleteSeasonAccount(ex, id);
  // Any entry left without its account (there shouldn't be one) goes too.
  await ex.delete(seasonEntry).where(eq(seasonEntry.userId, userId));
  await ex.delete(badge).where(eq(badge.userId, userId));
}

async function eraseKind(ex: Executor, userId: string, kind: DataKind) {
  switch (kind) {
    case "portfolio":
      return restartPortfolio(ex, userId);
    case "watchlist":
      await ex.delete(watchlistItem).where(eq(watchlistItem.userId, userId));
      await ex.delete(priceAlert).where(eq(priceAlert.userId, userId));
      return;
    case "backtests":
      // Their price snapshots, if no other run uses them, go in the daily cleanup.
      await ex.delete(backtestRun).where(eq(backtestRun.userId, userId));
      return;
    case "lessons":
      return deleteLearnerOf(ex, userId);
    case "community":
      return eraseCommunity(ex, userId);
    case "notifications":
      await deleteDevicesOf(ex, userId);
      await ex.delete(emailPreference).where(eq(emailPreference.userId, userId));
      return;
    case "picture":
      await ex.delete(avatar).where(eq(avatar.userId, userId));
      await ex.update(user).set({ image: null }).where(eq(user.id, userId));
      return;
  }
}

/** Every MarketLab row of a user, leaving only the user, its sessions and its sign-in methods. For use inside a transaction. */
async function eraseEverything(ex: Executor, userId: string) {
  await eraseCommunity(ex, userId);
  for (const table of [...PORTFOLIO_TABLES, watchlistItem, priceAlert]) await ex.delete(table).where(eq(table.userId, userId));
  await ex.delete(portfolio).where(eq(portfolio.userId, userId));
  await ex.delete(backtestRun).where(eq(backtestRun.userId, userId));
  await deleteLearnerOf(ex, userId);
  await deleteDevicesOf(ex, userId);
  await ex.delete(emailPreference).where(eq(emailPreference.userId, userId));
  await ex.delete(avatar).where(eq(avatar.userId, userId));
}

/** Rows without their user ID (it's the same on every row). */
function withoutUser<T extends { userId: string }>(rows: T[]): Omit<T, "userId">[] {
  return rows.map((row) => {
    const { userId, ...rest } = row;
    void userId;
    return rest;
  });
}

async function portfolioOf(ex: Executor, userId: string) {
  const [row] = await ex.select({ cash: portfolio.cash, createdAt: portfolio.createdAt, processedThrough: portfolio.processedThrough }).from(portfolio).where(eq(portfolio.userId, userId));
  if (!row) return null;
  const [holdings, trades, events, orders, options, values] = await Promise.all([
    ex.select().from(holding).where(eq(holding.userId, userId)),
    ex.select().from(trade).where(eq(trade.userId, userId)).orderBy(trade.time),
    ex.select().from(accountEvent).where(eq(accountEvent.userId, userId)).orderBy(accountEvent.time),
    ex.select().from(pendingOrder).where(eq(pendingOrder.userId, userId)).orderBy(pendingOrder.createdAt),
    ex.select().from(optionPosition).where(eq(optionPosition.userId, userId)),
    ex.select().from(portfolioValue).where(eq(portfolioValue.userId, userId)).orderBy(portfolioValue.time),
  ]);
  return {
    ...row,
    holdings: withoutUser(holdings),
    trades: withoutUser(trades),
    events: withoutUser(events),
    orders: withoutUser(orders),
    options: withoutUser(options),
    dailyValues: withoutUser(values),
  };
}

const parseJson = (text: string | null) => {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export function createPersonalDataRepository(db: Db) {
  const transaction = <T>(fn: (tx: Executor) => Promise<T>) => writeTransaction(db, fn);

  return {
    /** Erases these kinds of the user's data, keeping the account (see DATA_KIND_INFO in lib/profile.ts). */
    erase: (userId: string, kinds: readonly DataKind[]) =>
      transaction(async (tx) => {
        for (const kind of kinds) await eraseKind(tx, userId, kind);
      }),

    /** Erases all of the user's MarketLab data, leaving the user row, sessions and sign-in methods for Better Auth to delete. */
    eraseEverything: (userId: string) => transaction((tx) => eraseEverything(tx, userId)),

    /** Deletes a guest (never a real account) with all its data. */
    deleteGuest: (guestId: string) =>
      transaction(async (tx) => {
        await eraseEverything(tx, guestId);
        await tx.delete(user).where(and(eq(user.id, guestId), eq(user.isGuest, true)));
      }),

    /** Deletes sessions and one-time sign-in values (Better Auth's) that have expired: they can never be used again. */
    async pruneExpiredSignIns(now: number) {
      await db.delete(session).where(lt(session.expiresAt, new Date(now)));
      await db.delete(verification).where(lt(verification.expiresAt, new Date(now)));
    },

    /** Whether the user has a password (an email + password sign-in), as opposed to only Google. */
    async hasPassword(userId: string): Promise<boolean> {
      const [row] = await db.select({ id: account.id }).from(account).where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
      return !!row;
    },

    /** How the user signs in: "credential" (email and password) and/or "google". */
    async signInMethods(userId: string): Promise<string[]> {
      const rows = await db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId));
      return [...new Set(rows.map((r) => r.providerId))].sort();
    },

    /** Saves the user's picture and points user.image at it. */
    setAvatar: (userId: string, type: AvatarType, data: Buffer, version: string, image: string, now: number) =>
      transaction(async (tx) => {
        await tx
          .insert(avatar)
          .values({ userId, type, data, version, updatedAt: now })
          .onConflictDoUpdate({ target: avatar.userId, set: { type, data, version, updatedAt: now } });
        await tx.update(user).set({ image, updatedAt: new Date(now) }).where(eq(user.id, userId));
      }),

    /** The user's picture, or null. */
    async avatar(userId: string): Promise<{ type: string; data: Buffer; version: string } | null> {
      const [row] = await db.select({ type: avatar.type, data: avatar.data, version: avatar.version }).from(avatar).where(eq(avatar.userId, userId));
      return row ?? null;
    },

    /**
     * Everything stored about the user, as plain data for a JSON download.
     * Never secrets: no password hash, session tokens or sign-in tokens, and
     * a push device's address only by its push service (the full address
     * would let anyone holding the file send that device notifications).
     */
    async exportAll(userId: string) {
      const [profile] = await db
        .select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, isGuest: user.isGuest, createdAt: user.createdAt, updatedAt: user.updatedAt })
        .from(user)
        .where(eq(user.id, userId));
      if (!profile) return null;
      const [signIns, sessions, watchlist, alerts, runs, [learnerRow], board, entries, badges, [emails], devices, picture] = await Promise.all([
        db.select({ method: account.providerId, createdAt: account.createdAt, updatedAt: account.updatedAt }).from(account).where(eq(account.userId, userId)),
        db
          .select({ createdAt: session.createdAt, updatedAt: session.updatedAt, expiresAt: session.expiresAt, ipAddress: session.ipAddress, userAgent: session.userAgent })
          .from(session)
          .where(eq(session.userId, userId)),
        db.select({ symbol: watchlistItem.symbol }).from(watchlistItem).where(eq(watchlistItem.userId, userId)).orderBy(watchlistItem.position),
        db.select().from(priceAlert).where(eq(priceAlert.userId, userId)).orderBy(priceAlert.createdAt),
        db.select().from(backtestRun).where(eq(backtestRun.userId, userId)),
        db.select().from(learner).where(eq(learner.userId, userId)),
        db.select({ displayName: leaderboardEntry.displayName, joinedAt: leaderboardEntry.joinedAt, startValue: leaderboardEntry.startValue }).from(leaderboardEntry).where(eq(leaderboardEntry.userId, userId)),
        db.select().from(seasonEntry).where(eq(seasonEntry.userId, userId)),
        db.select({ kind: badge.kind, scope: badge.scope, earnedAt: badge.earnedAt }).from(badge).where(eq(badge.userId, userId)),
        db.select({ alertEmails: emailPreference.alertEmails, updatedAt: emailPreference.updatedAt }).from(emailPreference).where(eq(emailPreference.userId, userId)),
        db.select({ endpoint: pushSubscription.endpoint, createdAt: pushSubscription.createdAt, lastSentAt: pushSubscription.lastSentAt }).from(pushSubscription).where(eq(pushSubscription.userId, userId)),
        db.select({ type: avatar.type, data: avatar.data, updatedAt: avatar.updatedAt }).from(avatar).where(eq(avatar.userId, userId)),
      ]);
      const progress = learnerRow ? await db.select().from(lessonProgress).where(eq(lessonProgress.learnerId, learnerRow.id)) : [];
      const accountIds = entries.map((e) => e.accountId);
      const standings = accountIds.length ? await db.select().from(seasonStanding).where(inArray(seasonStanding.accountId, accountIds)) : [];

      return {
        profile,
        signInMethods: signIns,
        sessions,
        portfolio: await portfolioOf(db, userId),
        watchlist: watchlist.map((w) => w.symbol),
        alerts: withoutUser(alerts),
        savedRuns: withoutUser(runs).map(({ config, summary, result, ...run }) => ({ ...run, config: parseJson(config), summary: parseJson(summary), result: parseJson(result) })),
        lessons: progress.map(({ term, answers, total, bestScore, passedAt, updatedAt }) => ({ term, answers: parseJson(answers), total, bestScore, passedAt, updatedAt })),
        leaderboard: board[0] ?? null,
        seasons: await Promise.all(
          entries.map(async ({ seasonId, displayName, joinedAt, startValue, finalValue, finalRank, accountId }) => {
            return {
              seasonId,
              displayName,
              joinedAt,
              startValue,
              finalValue,
              finalRank,
              portfolio: await portfolioOf(db, accountId),
              standings: standings.filter((s) => s.accountId === accountId).map(({ time, value }) => ({ time, value })),
            };
          }),
        ),
        badges,
        emailPreferences: emails ?? null,
        pushDevices: devices.map((d) => ({ pushService: hostOf(d.endpoint), createdAt: d.createdAt, lastSentAt: d.lastSentAt })),
        profilePicture: picture[0] ? { type: picture[0].type, updatedAt: picture[0].updatedAt, dataUrl: `data:${picture[0].type};base64,${picture[0].data.toString("base64")}` } : null,
      };
    },
  };
}

const hostOf = (endpoint: string) => {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown";
  }
};

export type PersonalDataRepository = ReturnType<typeof createPersonalDataRepository>;
