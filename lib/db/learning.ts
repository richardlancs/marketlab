/**
 * Reading and changing lesson progress in the database. Every learner
 * belongs to a user, signed in or a guest (`user.isGuest`), so everything
 * here is keyed by user ID.
 *
 * Every change runs as one write transaction (./transaction.ts) that reads
 * the lesson's row, applies the rules in lib/lessons/progress.ts, and writes
 * it back, so two answers sent at once (two tabs, a double click) can't
 * overwrite each other.
 *
 * This takes the database as a parameter so tests can use a throwaway one.
 * App code uses the instance from ./index.ts, which is server-only.
 */
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
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

const learnerOf = async (ex: Executor, userId: string) => (await ex.select({ id: learner.id }).from(learner).where(eq(learner.userId, userId)))[0]?.id;

/** The user's learner ID, created on first use. */
async function ensureLearner(ex: Executor, userId: string, now: number): Promise<string> {
  const found = await learnerOf(ex, userId);
  if (found) return found;
  const id = crypto.randomUUID();
  await ex.insert(learner).values({ id, userId, createdAt: now, updatedAt: now });
  return id;
}

async function deleteLearner(ex: Executor, learnerId: string) {
  // Explicitly, rather than relying on the cascade (SQLite only enforces it with foreign keys switched on).
  await ex.delete(lessonProgress).where(eq(lessonProgress.learnerId, learnerId));
  await ex.delete(learner).where(eq(learner.id, learnerId));
}

/** Merges the progress of learner `fromId` into `toId` (best score, earliest pass, latest answers), then deletes `fromId`. */
async function mergeInto(ex: Executor, fromId: string, toId: string) {
  const mine = await readAll(ex, toId);
  const merged = mergeProgress(mine, await readAll(ex, fromId));
  for (const [term, p] of Object.entries(merged) as [TermKey, LessonProgress][]) {
    if (p !== mine[term]) await write(ex, toId, term, p);
  }
  await deleteLearner(ex, fromId);
}

/**
 * Merges one user's lesson progress into another's (a guest signing in), and
 * deletes the first user's learner. For use inside a transaction.
 */
export async function mergeLearners(ex: Executor, fromUserId: string, toUserId: string, now: number) {
  const from = await learnerOf(ex, fromUserId);
  if (from) await mergeInto(ex, from, await ensureLearner(ex, toUserId, now));
}

/**
 * Attaches a learner from before guests were users (Phase 10's learner
 * cookie, `userId` null) to `userId`, merging if that user already has one.
 * Anything else (an unknown ID, someone else's learner) is left alone.
 * For use inside a transaction.
 */
export async function adoptLearner(ex: Executor, learnerId: string, userId: string, now: number) {
  const [orphan] = await ex.select({ id: learner.id }).from(learner).where(and(eq(learner.id, learnerId), isNull(learner.userId)));
  if (!orphan) return;
  const existing = await learnerOf(ex, userId);
  if (existing) await mergeInto(ex, orphan.id, existing);
  else await ex.update(learner).set({ userId, updatedAt: now }).where(eq(learner.id, orphan.id));
}

/** Deletes a user's learner and progress. For use inside a transaction. */
export async function deleteLearnerOf(ex: Executor, userId: string) {
  const id = await learnerOf(ex, userId);
  if (id) await deleteLearner(ex, id);
}

export type ProgressChange = (current: LessonProgress | undefined) => { ok: true; progress: LessonProgress } | { ok: false; message: string };

export function createLearningRepository(db: Db) {
  const transaction = <T>(fn: (tx: Executor) => Promise<T>) => writeTransaction(db, fn);

  return {
    /**
     * Deletes learners from before guests were users (Phase 10's cookie,
     * `userId` null) untouched since `cutoff`: their browser never came back
     * to have them attached. Returns how many went.
     */
    deleteOrphans: (cutoff: number, limit: number) =>
      transaction(async (tx) => {
        const ids = (await tx.select({ id: learner.id }).from(learner).where(and(isNull(learner.userId), lt(learner.updatedAt, cutoff))).limit(limit)).map((r) => r.id);
        if (ids.length) {
          await tx.delete(lessonProgress).where(inArray(lessonProgress.learnerId, ids));
          await tx.delete(learner).where(inArray(learner.id, ids));
        }
        return ids.length;
      }),

    /** A user's progress (nothing if they've never started). */
    async load(userId: string): Promise<ProgressMap> {
      const id = await learnerOf(db, userId);
      return id ? readAll(db, id) : {};
    },

    /** Changes one lesson's progress (the user's learner is created if needed). Returns the new progress, or the reason it was refused. */
    change(userId: string, term: TermKey, apply: ProgressChange, now: number) {
      return transaction(async (tx): Promise<{ ok: true; progress: LessonProgress } | { ok: false; message: string }> => {
        const learnerId = await ensureLearner(tx, userId, now);
        const all = await readAll(tx, learnerId);
        const result = apply(all[term]);
        if (result.ok) await write(tx, learnerId, term, result.progress);
        return result;
      });
    },
  };
}

export type LearningRepository = ReturnType<typeof createLearningRepository>;
