/**
 * Guest mode's saved backtests, in this browser's localStorage. Same pattern
 * as the account store (lib/account-store.ts): shaped for useSyncExternalStore,
 * with the parsed list cached until the stored text changes.
 */
import { MAX_SAVED_RUNS, parseSavedRun, type SavedRun } from "./config";

export const SAVED_RUNS_KEY = "marketlab:backtests";
const VERSION = 1;
const EMPTY: SavedRun[] = [];

export function decodeSavedRuns(raw: string | null, symbols: readonly string[]): SavedRun[] {
  if (raw === null) return EMPTY;
  try {
    const data = JSON.parse(raw) as { version?: unknown; runs?: unknown };
    if (data?.version !== VERSION || !Array.isArray(data.runs)) return EMPTY;
    // Invalid entries are dropped one by one, so one bad run doesn't lose the rest.
    return data.runs.map((r) => parseSavedRun(r, symbols)).filter((r): r is SavedRun => r !== null).slice(0, MAX_SAVED_RUNS);
  } catch {
    return EMPTY;
  }
}

export function createSavedRunsStore(symbols: readonly string[]) {
  let cachedRaw: string | null | undefined;
  let cached: SavedRun[] = EMPTY;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const onStorage = (event: StorageEvent) => {
    if (event.key === SAVED_RUNS_KEY || event.key === null) notify();
  };

  return {
    getSnapshot(): SavedRun[] {
      let raw: string | null;
      try {
        raw = localStorage.getItem(SAVED_RUNS_KEY);
      } catch {
        return cached;
      }
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cached = decodeSavedRuns(raw, symbols);
      }
      return cached;
    },
    subscribe(listener: () => void) {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
    set(runs: SavedRun[]) {
      cached = runs;
      try {
        const raw = JSON.stringify({ version: VERSION, runs });
        localStorage.setItem(SAVED_RUNS_KEY, raw);
        cachedRaw = raw;
      } catch {
        // Blocked or full: keep the list in memory for this visit.
      }
      notify();
    },
  };
}
