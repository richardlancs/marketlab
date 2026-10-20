import { describe, expect, it } from "vitest";
import {
  answerQuestion,
  current,
  lastUnfinished,
  mergeLesson,
  mergeProgress,
  parseLegacyProgress,
  parseLessonProgress,
  passed,
  passedTerms,
  retry,
  type LessonProgress,
} from "./progress";

// Four questions; the right answers are 1, 0, 2, 1.
const quiz = [1, 0, 2, 1].map((answer) => ({ answer, choices: ["a", "b", "c", "d"] }));

/** Answers the whole quiz with `choices`, starting from `from`. */
function attempt(choices: number[], from?: LessonProgress, now = 100) {
  let p = from;
  for (const [i, c] of choices.entries()) {
    const result = answerQuestion(p, quiz, i, c, now + i);
    if (!result.ok) throw new Error(result.message);
    p = result.progress;
  }
  return p!;
}

describe("passing", () => {
  it("takes 3 of 4", () => {
    expect(passed(3, 4)).toBe(true);
    expect(passed(2, 4)).toBe(false);
    expect(passed(0, 0)).toBe(false);
  });
});

describe("answering", () => {
  it("keeps half-finished answers without scoring them", () => {
    const first = answerQuestion(undefined, quiz, 2, 2, 10);
    expect(first).toEqual({ ok: true, progress: { answers: [null, null, 2, null], bestScore: null, total: 4, passedAt: null, updatedAt: 10 } });
  });

  it("scores a finished attempt and marks the first pass", () => {
    const p = attempt([1, 0, 2, 3]);
    expect(p.bestScore).toBe(3);
    expect(p.passedAt).toBe(103);
  });

  it("doesn't pass with too few right", () => {
    const p = attempt([0, 0, 0, 0]);
    expect(p.bestScore).toBe(1);
    expect(p.passedAt).toBeNull();
  });

  it("won't change an answer, or take a question or choice that doesn't exist", () => {
    const p = attempt([1]);
    expect(answerQuestion(p, quiz, 0, 2, 5).ok).toBe(false);
    expect(answerQuestion(p, quiz, 4, 0, 5).ok).toBe(false);
    expect(answerQuestion(p, quiz, -1, 0, 5).ok).toBe(false);
    expect(answerQuestion(p, quiz, 1, 4, 5).ok).toBe(false);
    expect(answerQuestion(p, quiz, 1.5, 0, 5).ok).toBe(false);
  });

  it("starts over if the quiz changed length since", () => {
    const old: LessonProgress = { answers: [1, 0, 2], bestScore: 3, total: 3, passedAt: 5, updatedAt: 5 };
    expect(current(old, 4)?.answers).toEqual([null, null, null, null]);
    expect(current(old, 4)?.bestScore).toBe(3);
  });
});

describe("trying again", () => {
  it("clears the answers but keeps the best score and the pass, which a worse attempt can't lower", () => {
    const good = attempt([1, 0, 2, 1]);
    const fresh = retry(good, 4, 200);
    expect(fresh).toEqual({ answers: [null, null, null, null], bestScore: 4, total: 4, passedAt: 103, updatedAt: 200 });
    const worse = attempt([0, 0, 0, 0], fresh, 300);
    expect(worse.bestScore).toBe(4);
    expect(worse.passedAt).toBe(103);
  });
});

describe("merging a guest's progress into an account", () => {
  const guest: LessonProgress = { answers: [1, null, null, null], bestScore: 2, total: 4, passedAt: null, updatedAt: 50 };
  const account: LessonProgress = { answers: [null, null, null, null], bestScore: 4, total: 4, passedAt: 20, updatedAt: 30 };

  it("keeps the best score, the earliest pass and the latest answers", () => {
    expect(mergeLesson(guest, account)).toEqual({ answers: [1, null, null, null], bestScore: 4, total: 4, passedAt: 20, updatedAt: 50 });
    expect(mergeLesson(account, guest)).toEqual(mergeLesson(guest, account));
  });

  it("keeps lessons only one side has", () => {
    expect(mergeProgress({ sharpe: guest }, { beta: account })).toEqual({ sharpe: guest, beta: account });
  });
});

describe("summaries", () => {
  it("list passed lessons and find the last unfinished one", () => {
    const progress = {
      sharpe: { answers: [1, null, null, null], bestScore: null, total: 4, passedAt: null, updatedAt: 9 },
      beta: { answers: [0, null, null, null], bestScore: null, total: 4, passedAt: null, updatedAt: 5 },
      rsi: { answers: [null, null, null, null], bestScore: 4, total: 4, passedAt: 3, updatedAt: 12 },
    };
    expect(passedTerms(progress)).toEqual(["rsi"]);
    expect(lastUnfinished(progress)).toBe("sharpe");
  });
});

describe("reading progress from outside", () => {
  it("accepts well-formed progress", () => {
    const p = { answers: [1, null, 2, null], bestScore: null, total: 4, passedAt: null, updatedAt: 1 };
    expect(parseLessonProgress(p)).toEqual(p);
  });

  it("drops anything malformed", () => {
    const ok = { answers: [1, null], bestScore: 1, total: 2, passedAt: null, updatedAt: 1 };
    for (const bad of [null, "x", { ...ok, total: 3 }, { ...ok, answers: [1.5, null] }, { ...ok, bestScore: 3 }, { ...ok, updatedAt: -1 }, { ...ok, passedAt: "now" }]) {
      expect(parseLessonProgress(bad)).toBeNull();
    }
  });

  it("reads the old browser list of passed lessons", () => {
    expect(parseLegacyProgress(JSON.stringify({ version: 1, passed: ["sharpe", "nope", "sharpe"] }))).toEqual(["sharpe"]);
    expect(parseLegacyProgress("not json")).toEqual([]);
    expect(parseLegacyProgress(null)).toEqual([]);
  });
});
