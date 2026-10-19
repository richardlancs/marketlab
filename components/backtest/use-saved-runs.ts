"use client";

import { startTransition, useEffect, useState, useSyncExternalStore } from "react";
import { useAccount } from "@/components/account/account-provider";
import { deleteBacktestAction, saveBacktestAction } from "@/lib/backtest-actions";
import { MAX_SAVED_RUNS, type BacktestConfig, type RunSummary, type SavedRun } from "@/lib/backtest/config";
import { createSavedRunsStore } from "@/lib/backtest/saved-local";
import { authClient } from "@/lib/auth-client";

export type SaveOutcome = { ok: true } | { ok: false; message: string };

/**
 * Saved backtests, wherever they live: this browser for guests, the database
 * for signed-in users (the same split as the account itself).
 * `runs` is null while it isn't known yet.
 */
export function useSavedRuns() {
  const { mode } = useAccount();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? null;

  const [store] = useState(() => createSavedRunsStore());
  const localRuns = useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);

  const [remote, setRemote] = useState<{ userId: string; runs: SavedRun[] } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch("/api/backtests", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { runs: SavedRun[] }) => {
        if (!cancelled) setRemote({ userId, runs: data.runs });
      })
      .catch(() => {
        if (!cancelled) setRemote({ userId, runs: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const remoteRuns = remote && remote.userId === userId ? remote.runs : null;
  const runs = mode === "guest" ? localRuns : mode === "signed-in" ? remoteRuns : null;

  async function save(name: string, config: BacktestConfig, summary: RunSummary): Promise<SaveOutcome> {
    if (userId) {
      // The server re-validates the settings and recomputes the summary itself.
      const result = await saveBacktestAction(name, config);
      if (!result.ok) return result;
      startTransition(() => setRemote((r) => ({ userId, runs: [result.run, ...(r?.userId === userId ? r.runs : [])] })));
      return { ok: true };
    }
    const current = store.getSnapshot();
    if (current.length >= MAX_SAVED_RUNS) return { ok: false, message: `You can save up to ${MAX_SAVED_RUNS} runs. Delete one to make room.` };
    store.set([{ id: crypto.randomUUID(), name: name.trim(), createdAt: Date.now(), config, summary }, ...current]);
    return { ok: true };
  }

  async function remove(id: string) {
    if (userId) {
      setRemote((r) => (r ? { ...r, runs: r.runs.filter((run) => run.id !== id) } : r));
      await deleteBacktestAction(id);
      return;
    }
    store.set(store.getSnapshot().filter((run) => run.id !== id));
  }

  return { runs, save, remove, signedIn: mode === "signed-in" };
}
