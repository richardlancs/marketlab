/**
 * Lesson progress: each lesson's quiz answers so far, its best score and when
 * it was first passed. Pure rules, shared by the browser (to show an answer
 * at once) and the server (which keeps the real record in the database and
 * scores answers itself; see lib/learn-actions.ts).
 */
import { GLOSSARY, type TermKey } from "../glossary";
import type { Question } from "./types";

/** A test is passed with at least this share of right answers (3 of 4). */
export const PASS_SHARE = 0.75;
export const passed = (score: number, total: number) => total > 0 && score >= Math.ceil(total * PASS_SHARE);

export interface LessonProgress {
  /** The current attempt: the chosen answer for each question, or null if not answered yet. */
  answers: (number | null)[];
  /** The best score of any finished attempt, or null before the first one. */
  bestScore: number | null;
  /** How many questions the quiz had when it was scored. */
  total: number;
  /** When a finished attempt first passed, or null if none has. */
  passedAt: number | null;
  /** When it last changed: "Continue" picks up the most recent unfinished lesson. */
  updatedAt: number;
}

export type ProgressMap = Partial<Record<TermKey, LessonProgress>>;

export const isTermKey = (value: unknown): value is TermKey => typeof value === "string" && Object.hasOwn(GLOSSARY, value);

const blank = (total: number) => Array.from({ length: total }, () => null);

/** A lesson's progress as it should be shown for a quiz of `total` questions: if the quiz changed length since, the attempt starts over. */
export function current(progress: LessonProgress | undefined, total: number): LessonProgress | undefined {
  if (!progress || progress.answers.length === total) return progress;
  return { ...progress, answers: blank(total) };
}

export const scoreOf = (answers: readonly (number | null)[], quiz: readonly Pick<Question, "answer">[]) => answers.filter((a, i) => a === quiz[i]?.answer).length;
export const isFinished = (answers: readonly (number | null)[]) => answers.length > 0 && answers.every((a) => a !== null);

export type AnswerResult = { ok: true; progress: LessonProgress } | { ok: false; message: string };

/**
 * Records `choice` for question `index`. An answer can't be changed once
 * given (the quiz shows the right one straight after); "Try again" starts a
 * new attempt instead. Finishing an attempt updates the best score, and the
 * first passing attempt sets `passedAt`.
 */
export function answerQuestion(
  progress: LessonProgress | undefined,
  quiz: readonly Pick<Question, "answer" | "choices">[],
  index: number,
  choice: number,
  now: number,
): AnswerResult {
  if (!Number.isInteger(index) || index < 0 || index >= quiz.length) return { ok: false, message: "That question doesn't exist." };
  if (!Number.isInteger(choice) || choice < 0 || choice >= quiz[index].choices.length) return { ok: false, message: "That answer doesn't exist." };
  const before = current(progress, quiz.length) ?? { answers: blank(quiz.length), bestScore: null, total: quiz.length, passedAt: null, updatedAt: now };
  if (before.answers[index] !== null) return { ok: false, message: "That question is already answered. Try again to start over." };

  const answers = before.answers.map((a, i) => (i === index ? choice : a));
  if (!isFinished(answers)) return { ok: true, progress: { ...before, answers, updatedAt: now } };

  const score = scoreOf(answers, quiz);
  return {
    ok: true,
    progress: {
      answers,
      bestScore: Math.max(score, before.bestScore ?? 0),
      total: quiz.length,
      passedAt: before.passedAt ?? (passed(score, quiz.length) ? now : null),
      updatedAt: now,
    },
  };
}

/** Starts a new attempt: clears the answers, keeps the best score and the pass. */
export const retry = (progress: LessonProgress | undefined, total: number, now: number): LessonProgress => ({
  bestScore: progress?.bestScore ?? null,
  passedAt: progress?.passedAt ?? null,
  total,
  answers: blank(total),
  updatedAt: now,
});

/**
 * One lesson's progress from two places (a guest's and their account's): the
 * best score of either, the earliest pass, and the answers of whichever was
 * worked on more recently.
 */
export function mergeLesson(a: LessonProgress | undefined, b: LessonProgress | undefined): LessonProgress | undefined {
  if (!a || !b) return a ?? b;
  const [older, newer] = a.updatedAt <= b.updatedAt ? [a, b] : [b, a];
  const best = [a.bestScore, b.bestScore].filter((s): s is number => s !== null);
  const passes = [a.passedAt, b.passedAt].filter((t): t is number => t !== null);
  return {
    answers: newer.answers,
    total: newer.total,
    bestScore: best.length ? Math.max(...best) : null,
    passedAt: passes.length ? Math.min(...passes) : null,
    updatedAt: Math.max(older.updatedAt, newer.updatedAt),
  };
}

export function mergeProgress(a: ProgressMap, b: ProgressMap): ProgressMap {
  const terms = new Set([...Object.keys(a), ...Object.keys(b)] as TermKey[]);
  return Object.fromEntries([...terms].map((t) => [t, mergeLesson(a[t], b[t])])) as ProgressMap;
}

/** The lessons whose test has been passed. */
export const passedTerms = (progress: ProgressMap) => (Object.keys(progress) as TermKey[]).filter((t) => progress[t]?.passedAt != null);

/** The lesson worked on most recently that isn't passed yet, if any. */
export function lastUnfinished(progress: ProgressMap): TermKey | undefined {
  return (Object.entries(progress) as [TermKey, LessonProgress][])
    .filter(([, p]) => p.passedAt === null && p.answers.some((a) => a !== null))
    .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)[0]?.[0];
}

/**
 * Validates progress that came from outside (the database, or a request).
 * Anything malformed is dropped rather than misread.
 */
export function parseLessonProgress(value: unknown): LessonProgress | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const int = (x: unknown, min = 0) => Number.isInteger(x) && (x as number) >= min;
  if (!Array.isArray(v.answers) || v.answers.length > 10 || !v.answers.every((a) => a === null || int(a))) return null;
  if (!int(v.total, 1) || v.total !== v.answers.length) return null;
  if (!(v.bestScore === null || (int(v.bestScore) && (v.bestScore as number) <= (v.total as number)))) return null;
  if (!(v.passedAt === null || int(v.passedAt)) || !int(v.updatedAt)) return null;
  return { answers: v.answers as (number | null)[], total: v.total as number, bestScore: v.bestScore as number | null, passedAt: v.passedAt as number | null, updatedAt: v.updatedAt as number };
}

/**
 * The list of passed lessons this browser kept before progress moved to the
 * database (localStorage "learn-progress", version 1). It's brought into the
 * database once, then removed.
 */
export const LEGACY_KEY = "learn-progress";
export function parseLegacyProgress(raw: string | null): TermKey[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as { version?: unknown; passed?: unknown };
    if (value.version !== 1 || !Array.isArray(value.passed)) return [];
    return [...new Set(value.passed.filter(isTermKey))];
  } catch {
    return [];
  }
}
