/**
 * Guests: people using MarketLab without an account. Each is a row in the
 * `user` table marked `isGuest`, so every other repository (accounts, saved
 * backtests, lesson progress) works for them exactly as for signed-in users.
 * lib/owner.ts gives a browser its guest through an httpOnly cookie.
 *
 * When a guest signs in, `handover` moves what they did into their account,
 * in one transaction:
 * - lesson progress and saved backtests are merged in;
 * - the portfolio moves over if the account has none, or if the guest's is
 *   just the untouched starting one (then it's simply dropped);
 * - otherwise both have a portfolio of their own, and the guest is kept
 *   (holding only its portfolio) until the user chooses one (`resolve`).
 */
import { and, eq, lt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { isStartingAccount } from "../starting-account";
import type { Account } from "../trading";
import { moveAccount, readAccount, removeAccount } from "./accounts";
import { moveRuns } from "./backtests";
import { adoptLearner, deleteLearnerOf, mergeLearners } from "./learning";
import * as schema from "./schema";
import { writeTransaction, type Executor } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;

const { user, backtestRun } = schema;

/** The email column must be unique and not null; a guest's can never receive mail (".invalid" is reserved for exactly this). */
const placeholderEmail = (id: string) => `guest-${id}@guest.invalid`;

async function isGuest(ex: Executor, id: string): Promise<boolean> {
  const [row] = await ex.select({ id: user.id }).from(user).where(and(eq(user.id, id), eq(user.isGuest, true)));
  return !!row;
}

/** Deletes a guest and everything it owns. For use inside a transaction. */
async function deleteGuest(ex: Executor, id: string) {
  await removeAccount(ex, id);
  await ex.delete(backtestRun).where(eq(backtestRun.userId, id));
  await deleteLearnerOf(ex, id);
  await ex.delete(user).where(and(eq(user.id, id), eq(user.isGuest, true)));
}

export type Handover = { conflict: null } | { conflict: Account };

export function createGuestRepository(db: Db) {
  const transaction = <T>(fn: (tx: Executor) => Promise<T>) => writeTransaction(db, fn);

  return {
    /** Creates a guest and returns its ID, for the browser's cookie. */
    async create(now: number): Promise<string> {
      const id = crypto.randomUUID();
      await db.insert(user).values({ id, name: "Guest", email: placeholderEmail(id), isGuest: true, createdAt: new Date(now), updatedAt: new Date(now) });
      return id;
    },

    /**
     * When the guest was last active, or null if `id` isn't a guest: a cookie
     * naming a real user (or nothing) is refused.
     */
    async lastActive(id: string): Promise<number | null> {
      const [row] = await db.select({ updatedAt: user.updatedAt }).from(user).where(and(eq(user.id, id), eq(user.isGuest, true)));
      return row ? row.updatedAt.getTime() : null;
    },

    /** Records that the guest was active, so the daily cleanup (lib/maintenance.ts) keeps it. */
    async touch(id: string, now: number) {
      await db.update(user).set({ updatedAt: new Date(now) }).where(and(eq(user.id, id), eq(user.isGuest, true)));
    },

    /** Attaches a Phase 10 learner (from its old cookie) to a user. */
    adoptLearner: (learnerId: string, userId: string, now: number) => transaction((tx) => adoptLearner(tx, learnerId, userId, now)),

    /**
     * Moves a guest's data into a signed-in user's account (see above).
     * Returns the guest's portfolio if both have one and the user must
     * choose; the guest is then kept until `resolve`.
     */
    handover: (guestId: string, userId: string, now: number) =>
      transaction(async (tx): Promise<Handover> => {
        if (!(await isGuest(tx, guestId)) || (await isGuest(tx, userId))) return { conflict: null };
        await mergeLearners(tx, guestId, userId, now);
        await moveRuns(tx, guestId, userId);
        const guestAccount = await readAccount(tx, guestId);
        if (guestAccount && !isStartingAccount(guestAccount)) {
          if (await readAccount(tx, userId)) return { conflict: guestAccount };
          await moveAccount(tx, guestId, userId);
        }
        await deleteGuest(tx, guestId);
        return { conflict: null };
      }),

    /** The guest's portfolio while a choice is pending, or null. */
    pending: (guestId: string) => readAccount(db, guestId),

    /**
     * Settles a handover conflict: keep the account's portfolio (the guest's
     * is dropped), or replace it with the guest's. Either way the guest is
     * then deleted.
     */
    resolve: (guestId: string, userId: string, choice: "keep-account" | "use-guest") =>
      transaction(async (tx) => {
        if (!(await isGuest(tx, guestId)) || (await isGuest(tx, userId))) return false;
        if (choice === "use-guest" && (await readAccount(tx, guestId))) {
          await removeAccount(tx, userId);
          await moveAccount(tx, guestId, userId);
        }
        await deleteGuest(tx, guestId);
        return true;
      }),

    /** Deletes guests inactive since before `cutoff`, at most `limit` at a time. Returns how many went. */
    deleteInactive: (cutoff: number, limit: number) =>
      transaction(async (tx) => {
        const stale = await tx
          .select({ id: user.id })
          .from(user)
          .where(and(eq(user.isGuest, true), lt(user.updatedAt, new Date(cutoff))))
          .limit(limit);
        for (const { id } of stale) await deleteGuest(tx, id);
        return stale.length;
      }),
  };
}

export type GuestRepository = ReturnType<typeof createGuestRepository>;
