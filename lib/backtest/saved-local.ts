/**
 * Saved backtests that this browser kept in localStorage before saved runs
 * moved to the database (guest mode used to keep them here). Only read now,
 * to bring them into the database once (components/backtest/use-saved-runs.ts).
 */
import { isSymbolFormat } from "../market/symbols";
import { MAX_SAVED_RUNS, parseSavedRun, type SavedRun } from "./config";

export const SAVED_RUNS_KEY = "marketlab:backtests";
const VERSION = 1;
const EMPTY: SavedRun[] = [];

/** Symbols are only checked for their format, so a run on a stock missing from today's data isn't dropped. */
export function decodeSavedRuns(raw: string | null, isKnown: (symbol: string) => boolean = isSymbolFormat): SavedRun[] {
  if (raw === null) return EMPTY;
  try {
    const data = JSON.parse(raw) as { version?: unknown; runs?: unknown };
    if (data?.version !== VERSION || !Array.isArray(data.runs)) return EMPTY;
    // Invalid entries are dropped one by one, so one bad run doesn't lose the rest.
    return data.runs.map((r) => parseSavedRun(r, isKnown)).filter((r): r is SavedRun => r !== null).slice(0, MAX_SAVED_RUNS);
  } catch {
    return EMPTY;
  }
}
