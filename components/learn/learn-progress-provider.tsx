"use client";

import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { answerQuestionAction, importBrowserPassesAction, retryQuizAction, type ProgressResult } from "@/lib/learn-actions";
import type { TermKey } from "@/lib/glossary";
import type { Question } from "@/lib/lessons";
import { answerQuestion, LEGACY_KEY, parseLegacyProgress, retry, type LessonProgress, type ProgressMap } from "@/lib/lessons/progress";
import { authClient } from "@/lib/auth-client";

interface LearnProgressValue {
  /** "loading" until this visitor's progress has arrived from the server. */
  status: "loading" | "ready" | "error";
  /** Where progress is saved: with the signed-in account, or for this browser's guest learner. */
  storage: "account" | "guest" | null;
  progress: ProgressMap;
  /** A save that failed, to show next to the quiz. */
  error: string | null;
  /** Records an answer: shown at once, saved in the background, undone if the save fails. */
  answer(term: TermKey, quiz: readonly Question[], index: number, choice: number): void;
  /** Starts the quiz again (keeping the best score and pass). */
  retry(term: TermKey, total: number): void;
}

const LearnProgressContext = createContext<LearnProgressValue | null>(null);

const OFFLINE = "Couldn't save your answer. Check your connection and try again.";

/**
 * Lesson progress for the Learn pages, saved in the database for everyone:
 * with the account when signed in, or with an anonymous learner cookie for
 * guests (lib/learn-progress.ts). It's fetched from /api/learn-progress, and
 * refetched when someone signs in or out; changes go through the Server
 * Actions in lib/learn-actions.ts, which score answers themselves.
 */
export function LearnProgressProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<{ status: LearnProgressValue["status"]; storage: LearnProgressValue["storage"]; progress: ProgressMap }>({
    status: "loading",
    storage: null,
    progress: {},
  });
  const [error, setError] = useState<string | null>(null);

  // Load (and reload whenever the signed-in user changes: sign-in merges guest progress on the server).
  useEffect(() => {
    if (isPending) return;
    let cancelled = false;
    async function load() {
      try {
        // Passes kept by this browser before progress moved to the database: brought in once.
        let legacy: TermKey[] = [];
        try {
          legacy = parseLegacyProgress(localStorage.getItem(LEGACY_KEY));
        } catch {
          // Storage blocked: nothing to bring in.
        }
        if (legacy.length && (await importBrowserPassesAction(legacy)).ok) {
          try {
            localStorage.removeItem(LEGACY_KEY);
          } catch {}
        }
        const response = await fetch("/api/learn-progress", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data: { progress: ProgressMap; storage: "account" | "guest" } = await response.json();
        if (!cancelled) setState({ status: "ready", storage: data.storage, progress: data.progress });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, status: "error" }));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, isPending]);

  // The latest save for each lesson. Answering quickly sends several saves;
  // only the newest one's reply is shown, so an older reply arriving late
  // can't put back answers that have since changed.
  const latestSave = useRef(new Map<TermKey, number>());
  // What each lesson was before its unconfirmed saves, to put back if they fail.
  const confirmed = useRef(new Map<TermKey, LessonProgress | undefined>());

  /** Shows `optimistic` for `term` now, then the server's version, or puts back what was there if it fails. */
  function update(term: TermKey, optimistic: LessonProgress, call: () => Promise<ProgressResult>) {
    const save = (latestSave.current.get(term) ?? 0) + 1;
    latestSave.current.set(term, save);
    if (!confirmed.current.has(term)) confirmed.current.set(term, state.progress[term]);
    setError(null);
    setState((s) => ({ ...s, progress: { ...s.progress, [term]: optimistic } }));
    const settle = (progress: LessonProgress | undefined, storage?: LearnProgressValue["storage"]) => {
      if (latestSave.current.get(term) !== save) return; // a newer save is on its way
      confirmed.current.delete(term);
      setState((s) => ({ ...s, storage: storage ?? s.storage, progress: { ...s.progress, [term]: progress } }));
    };
    call()
      .then((result) => {
        if (!result.ok) throw new Error(result.message);
        settle(result.progress, result.storage);
      })
      .catch((e: unknown) => {
        settle(confirmed.current.get(term));
        setError(e instanceof Error && e.message && !/fetch|network/i.test(e.message) ? e.message : OFFLINE);
      });
  }

  const value: LearnProgressValue = {
    status: state.status,
    storage: state.storage,
    progress: state.progress,
    error,
    answer(term, quiz, index, choice) {
      const result = answerQuestion(state.progress[term], quiz, index, choice, Date.now());
      if (!result.ok) return setError(result.message);
      update(term, result.progress, () => answerQuestionAction(term, index, choice));
    },
    retry(term, total) {
      update(term, retry(state.progress[term], total, Date.now()), () => retryQuizAction(term));
    },
  };

  return <LearnProgressContext value={value}>{children}</LearnProgressContext>;
}

export function useLearnProgress(): LearnProgressValue {
  const value = use(LearnProgressContext);
  if (!value) throw new Error("useLearnProgress must be used inside <LearnProgressProvider>");
  return value;
}
