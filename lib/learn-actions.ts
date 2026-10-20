"use server";

/**
 * Server Actions that save lesson progress, for signed-in users and guests
 * (lib/owner.ts works out which).
 *
 * Each one is a public endpoint, so arguments are untrusted: the lesson,
 * question and choice are checked, and the server marks answers right or
 * wrong against the lesson's own answer key. The browser only says which
 * choice was picked, so a request can't claim a pass.
 */
import { learning } from "./db";
import { currentOwner } from "./owner";
import { getLesson } from "./lessons";
import { answerQuestion, current, isTermKey, retry, type LessonProgress } from "./lessons/progress";

export type ProgressResult = { ok: true; progress: LessonProgress; storage: "account" | "guest" } | { ok: false; message: string };

const NO_LESSON: ProgressResult = { ok: false, message: "That lesson doesn't exist." };

const lessonFor = (term: unknown) => (isTermKey(term) ? { term, lesson: getLesson(term) } : null);

async function save(term: Parameters<typeof learning.change>[1], apply: Parameters<typeof learning.change>[2]): Promise<ProgressResult> {
  const owner = await currentOwner({ create: true });
  if (!owner) return { ok: false, message: "Couldn't save your progress. Reload the page and try again." };
  const result = await learning.change(owner.id, term, apply, Date.now());
  return result.ok ? { ...result, storage: owner.kind === "user" ? "account" : "guest" } : result;
}

/** Saves the answer `choice` to question `index` of a lesson's quiz. */
export async function answerQuestionAction(term: unknown, index: unknown, choice: unknown): Promise<ProgressResult> {
  const found = lessonFor(term);
  if (!found?.lesson) return NO_LESSON;
  const { lesson } = found;
  if (typeof index !== "number" || typeof choice !== "number") return { ok: false, message: "That answer doesn't exist." };
  return save(found.term, (p) => answerQuestion(p, lesson.quiz, index, choice, Date.now()));
}

/** "Try again": clears a lesson's answers, keeping its best score and pass. */
export async function retryQuizAction(term: unknown): Promise<ProgressResult> {
  const found = lessonFor(term);
  if (!found?.lesson) return NO_LESSON;
  const total = found.lesson.quiz.length;
  return save(found.term, (p) => ({ ok: true, progress: retry(p, total, Date.now()) }));
}

/**
 * Brings in lessons this browser marked as passed before progress moved to
 * the database (they were only ever kept in the browser). They're taken as
 * passed without a score: the answers that earned them were never saved.
 */
export async function importBrowserPassesAction(terms: unknown): Promise<{ ok: boolean }> {
  if (!Array.isArray(terms) || terms.length > 100) return { ok: false };
  const valid = [...new Set(terms.filter(isTermKey))].filter((t) => getLesson(t));
  for (const term of valid) {
    const total = getLesson(term)!.quiz.length;
    const now = Date.now();
    const result = await save(term, (p) => {
      if (p?.passedAt != null) return { ok: true, progress: p }; // already passed here
      // Keep any answers in progress; just add the pass.
      const base = current(p, total) ?? retry(undefined, total, now);
      return { ok: true, progress: { ...base, passedAt: now, updatedAt: now } };
    });
    if (!result.ok) return { ok: false };
  }
  return { ok: true };
}
