"use client";

import { startTransition, useEffect, useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { deleteBacktestAction, importBrowserRunsAction, saveBacktestAction } from "@/lib/backtest-actions";
import type { BacktestConfig, SavedRun } from "@/lib/backtest/config";
import { decodeSavedRuns, SAVED_RUNS_KEY } from "@/lib/backtest/saved-local";

export type SaveOutcome = { ok: true } | { ok: false; message: string };

/**
 * Saved backtests, in the database for everyone: the signed-in user's, or
 * this browser's guest's (lib/owner.ts). `runs` is null while loading.
 * Runs this browser kept in localStorage before are brought in once.
 */
export function useSavedRuns() {
  const { mode } = useAccount();
  const [loaded, setLoaded] = useState<{ mode: string; runs: SavedRun[] } | null>(null);

  // Reload when whose runs they are changes (signing in hands a guest's runs over).
  useEffect(() => {
    if (mode === "loading") return;
    let cancelled = false;
    async function load() {
      let local: SavedRun[] = [];
      try {
        local = decodeSavedRuns(localStorage.getItem(SAVED_RUNS_KEY));
      } catch {
        // Storage blocked: nothing to bring in.
      }
      if (local.length && (await importBrowserRunsAction(local).catch(() => null))?.ok) {
        try {
          localStorage.removeItem(SAVED_RUNS_KEY);
        } catch {}
      }
      const runs = await fetch("/api/backtests", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data: { runs: SavedRun[] }) => data.runs)
        .catch(() => []);
      if (!cancelled) setLoaded({ mode, runs });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const runs = loaded && loaded.mode === mode ? loaded.runs : null;

  /** Saves a run. The server re-validates the settings and computes the summary itself, from its own prices. */
  async function save(name: string, config: BacktestConfig): Promise<SaveOutcome> {
    const result = await saveBacktestAction(name, config);
    if (!result.ok) return result;
    startTransition(() => setLoaded((l) => ({ mode, runs: [result.run, ...(l?.mode === mode ? l.runs : [])] })));
    return { ok: true };
  }

  async function remove(id: string) {
    setLoaded((l) => (l ? { ...l, runs: l.runs.filter((run) => run.id !== id) } : l));
    await deleteBacktestAction(id);
  }

  return { runs, save, remove, signedIn: mode === "signed-in" };
}
