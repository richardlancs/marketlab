/**
 * Reading and changing lesson progress in the database, for signed-in users
 * and anonymous guest learners alike (see the `learner` table).
 *
 * Every change runs as one write transaction (./transaction.ts) that reads
 * the lesson's row, applies the rules in lib/lessons/progress.ts, and writes
 * it back, so two answers sent at once (two tabs, a double click) can't
 * overwrite each other.
 *
 * This takes the database as a parameter so tests can use a throwaway one.
 * App code uses the instance from ./index.ts, which is server-only.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { TermKey } from "../glossary";
import { isTermKey, mergeProgress, parseLessonProgress, type LessonProgress, type ProgressMap } from "../lessons/progress";
import * as schema from "./schema";
import { writeTransaction, type Executor } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;

const { learner, lessonProgress } = schema;

async function readAll(ex: Executor, learnerId: string): Promise<ProgressMap> {
  const rows = await ex.select().from(lessonProgress).where(eq(lessonProgress.learnerId, learnerId));
  const progress: ProgressMap = {};
  for (const row of rows) {
    let answers: unknown;
    try {
      answers = JSON.parse(row.answers);
    } catch {
      continue;
    }
    const parsed = parseLessonProgress({ answers, total: row.total, bestScore: row.bestScore, passedAt: row.passedAt, updatedAt: row.updatedAt });
    // A term from lessons that have since been removed is skipped.
    if (parsed && isTermKey(row.term)) progress[row.term] = parsed;
  }
  return progress;
}

async function write(ex: Executor, learnerId: string, term: TermKey, p: LessonProgress) {
  const values = { answers: JSON.stringify(p.answers), total: p.total, bestScore: p.bestScore, passedAt: p.passedAt, updatedAt: p.updatedAt };
  await ex
    .insert(lessonProgress)
    .values({ learnerId, term, ...values })
    .onConflictDoUpdate({ target: [lessonProgress.learnerId, lessonProgress.term], set: values });
  await ex.update(learner).set({ updatedAt: p.updatedAt }).where(eq(learner.id, learnerId));
}

/** The learner ID for a signed-in user, created on first use. */
async function userLearner(ex: Executor, userId: string, now: number): Promise<string> {
  const [found] = await ex.select({ id: learner.id }).from(learner).where(eq(learner.userId, userId));
  if (found) return found.id;
  const id = crypto.randomUUID();
  await ex.insert(learner).values({ id, userId, createdAt: now, updatedAt: now });
  return id;
}

export type ProgressChange = (current: LessonProgress | undefined) => { ok: true; progress: LessonProgress } | { ok: false; message: string };

export function createLearningRepository(db: Db) {
  const transaction = <T>(fn: (tx: Executor) => Promise<T>) => writeTransaction(db, fn);

  return {
    /** A signed-in user's progress (nothing if they've never started). */
    async loadForUser(userId: string): Promise<ProgressMap> {
      const [found] = await db.select({ id: learner.id }).from(learner).where(eq(learner.userId, userId));
      return found ? readAll(db, found.id) : {};
    },

    /** An anonymous learner's progress, or null if there's no such guest (an unknown or stale cookie). */
    async loadGuest(guestId: string): Promise<ProgressMap | null> {
      const [found] = await db.select({ id: learner.id }).from(learner).where(and(eq(learner.id, guestId), isNull(learner.userId)));
      return found ? readAll(db, guestId) : null;
    },

    /** Creates a new anonymous learner and returns its ID, for the guest's cookie. */
    async createGuest(now: number): Promise<string> {
      const id = crypto.randomUUID();
      await db.insert(learner).values({ id, userId: null, createdAt: now, updatedAt: now });
      return id;
    },

    /**
     * Changes one lesson's progress. `who` is a signed-in user (their learner
     * is created if needed) or an existing guest learner. Returns the new
     * progress, or the reason it was refused.
     */
    change(who: { userId: string } | { guestId: string }, term: TermKey, apply: ProgressChange, now: number) {
      return transaction(async (tx): Promise<{ ok: true; progress: LessonProgress } | { ok: false; message: string }> => {
        let learnerId: string;
        if ("userId" in who) learnerId = await userLearner(tx, who.userId, now);
        else {
          const [found] = await tx.select({ id: learner.id }).from(learner).where(and(eq(learner.id, who.guestId), isNull(learner.userId)));
          if (!found) return { ok: false, message: "Your guest progress wasn't found. Reload the page to start again." };
          learnerId = found.id;
        }
        const all = await readAll(tx, learnerId);
        const result = apply(all[term]);
        if (result.ok) await write(tx, learnerId, term, result.progress);
        return result;
      });
    },

    /**
     * Moves a guest's progress into a signed-in user's: every lesson merged
     * (best score, earliest pass, latest answers), then the anonymous learner
     * deleted. Does nothing if the guest doesn't exist. Returns the user's
     * progress afterwards.
     */
    mergeGuestIntoUser(guestId: string, userId: string, now: number) {
      return transaction(async (tx): Promise<ProgressMap> => {
        const learnerId = await userLearner(tx, userId, now);
        const [guest] = await tx.select({ id: learner.id }).from(learner).where(and(eq(learner.id, guestId), isNull(learner.userId)));
        const mine = await readAll(tx, learnerId);
        if (!guest) return mine;
        const merged = mergeProgress(mine, await readAll(tx, guestId));
        for (const [term, p] of Object.entries(merged) as [TermKey, LessonProgress][]) {
          if (p !== mine[term]) await write(tx, learnerId, term, p);
        }
        // Explicitly, rather than relying on the cascade (SQLite only enforces it with foreign keys switched on).
        await tx.delete(lessonProgress).where(eq(lessonProgress.learnerId, guestId));
        await tx.delete(learner).where(eq(learner.id, guestId));
        return merged;
      });
    },
  };
}

export type LearningRepository = ReturnType<typeof createLearningRepository>;
