"use client";

import { useState } from "react";
import type { TermKey } from "@/lib/glossary";
import type { Question } from "@/lib/lessons";
import { current, passed } from "@/lib/lessons/progress";
import { useLearnProgress } from "./learn-progress-provider";

/**
 * "Test yourself": a few multiple-choice questions. Each answer is marked
 * right or wrong at once, with an explanation, and saved as it's given, so a
 * reload (or another device, signed in) picks up where you left off. Passing
 * (3 of 4 or better) puts a ✓ on the lesson in /learn. It's optional:
 * nothing else depends on it.
 */
export function LessonQuiz({ term, questions }: { term: TermKey; questions: readonly Question[] }) {
  const { status, storage, progress, error, answer, retry: retryQuiz } = useLearnProgress();
  const saved = current(progress[term], questions.length);
  const answers = saved?.answers ?? questions.map(() => null);
  // Bumped on "Try again", so each attempt's question cards start fresh.
  const [attempt, setAttempt] = useState(0);
  const loading = status === "loading";

  const answered = answers.filter((a) => a !== null).length;
  const score = answers.filter((a, i) => a === questions[i].answer).length;
  const done = answered === questions.length;
  const pass = passed(score, questions.length);
  const alreadyPassed = saved?.passedAt != null;

  function choose(questionIndex: number, choice: number) {
    if (loading || answers[questionIndex] !== null) return;
    answer(term, questions, questionIndex, choice);
  }

  function retry() {
    retryQuiz(term, questions.length);
    setAttempt((n) => n + 1);
  }

  return (
    <div>
      <p className="text-sm text-muted">
        Optional: {questions.length} quick questions on the words, using the idea, and how it plays out in real markets.
        {alreadyPassed && !done && <span className="ml-1 font-medium text-gain">You’ve passed this one before ✓</span>}
      </p>
      <p className="mt-1 text-xs text-muted" aria-live="polite">
        {loading
          ? "Loading your answers…"
          : status === "error"
            ? "Couldn’t load your saved answers. New answers will still be saved."
            : storage === "account"
              ? "Answers are saved to your account as you go."
              : "Answers are saved for this browser as you go. Sign in to keep them on every device."}
      </p>
      <ol className="mt-4 space-y-4">
        {questions.map((q, qi) => {
          const chosen = answers[qi];
          return (
            <li key={`${attempt}-${qi}`} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <fieldset>
                <legend className="w-full">
                  <span className="text-xs font-medium tracking-wide text-muted uppercase">
                    {qi + 1} of {questions.length} · {q.kind}
                  </span>
                  <span className="mt-1 block font-medium">{q.prompt}</span>
                </legend>
                <div className="mt-3 grid gap-2">
                  {q.choices.map((choice, ci) => {
                    const isAnswer = ci === q.answer;
                    const state = chosen === null ? "open" : isAnswer ? "right" : chosen === ci ? "wrong" : "other";
                    return (
                      <button
                        key={ci}
                        type="button"
                        onClick={() => choose(qi, ci)}
                        disabled={chosen !== null || loading}
                        aria-pressed={chosen === ci}
                        className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                          state === "open"
                            ? "border-border hover:border-accent/50 hover:bg-accent/5"
                            : state === "right"
                              ? "border-gain/40 bg-gain/10"
                              : state === "wrong"
                                ? "border-loss/40 bg-loss/10"
                                : "border-border opacity-60"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`mt-px grid size-5 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                            state === "right" ? "border-gain bg-gain text-background" : state === "wrong" ? "border-loss bg-loss text-background" : "border-border text-muted"
                          }`}
                        >
                          {state === "right" ? "✓" : state === "wrong" ? "✕" : String.fromCharCode(65 + ci)}
                        </span>
                        <span>
                          {choice}
                          {state === "right" && chosen === ci && <span className="sr-only"> (your answer, correct)</span>}
                          {state === "right" && chosen !== ci && <span className="sr-only"> (correct answer)</span>}
                          {state === "wrong" && <span className="sr-only"> (your answer, incorrect)</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {chosen !== null && (
                  <p role="status" className="mt-3 text-sm">
                    <span className={`font-semibold ${chosen === q.answer ? "text-gain" : "text-loss"}`}>{chosen === q.answer ? "Right." : "Not quite."}</span>{" "}
                    <span className="text-muted">{q.explanation}</span>
                  </p>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-loss/30 bg-loss/10 px-3.5 py-2.5 text-sm">
          {error}
        </p>
      )}
      <div aria-live="polite" className="mt-4">
        {done && (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${pass ? "border-gain/30 bg-gain/10" : "border-border bg-surface"}`}>
            <p className="text-sm">
              <span className="font-semibold">
                {score} of {questions.length} right.
              </span>{" "}
              {pass ? "Passed: this lesson is marked done on the Learn page." : "Have another look at the lesson and try again."}
            </p>
            <button
              type="button"
              onClick={retry}
              className="rounded-full px-3.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
