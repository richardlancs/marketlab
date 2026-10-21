"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STRATEGY_NAMES, type SavedRun } from "@/lib/backtest/config";
import { formatDate, formatPercent } from "@/lib/format";
import { holdingsLabel } from "./backtest-results";

export const MAX_COMPARED = 4;

// Saved dates are midnight UTC (start) and the last moment of the day (end).
// Formatting at midday keeps the calendar date the same in New York time.
const HALF_DAY = 12 * 60 * 60 * 1000;
const dateRange = (start: number, end: number) => `${formatDate(start + HALF_DAY)} – ${formatDate(end - HALF_DAY)}`;

interface SavedRunsProps {
  runs: SavedRun[] | null;
  signedIn: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onCompare: () => void;
  onOpen: (run: SavedRun) => void;
  onDelete: (run: SavedRun) => void;
}

/** The list of saved runs: open one, delete one, or tick up to four to compare. */
export function SavedRuns({ runs, signedIn, selected, onToggle, onCompare, onOpen, onDelete }: SavedRunsProps) {
  return (
    <Card aria-labelledby="saved-runs" aria-busy={runs === null}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="saved-runs" className="text-lg font-semibold tracking-tight">
          Saved runs
        </h2>
        <span className="text-xs text-muted">{signedIn ? "In your account" : "For this browser"}</span>
      </div>

      {runs === null ? (
        <Skeleton className="mt-3 h-24" />
      ) : runs.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Runs you save appear here, so you can reopen and compare them.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border">
            {runs.map((run) => {
              const checked = selected.includes(run.id);
              const full = !checked && selected.length >= MAX_COMPARED;
              return (
                <li key={run.id} className="flex items-start gap-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={full}
                    onChange={() => onToggle(run.id)}
                    aria-label={`Compare ${run.name}`}
                    title={full ? `Compare up to ${MAX_COMPARED} runs` : undefined}
                    className="mt-1 size-4 accent-accent"
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onOpen(run)}
                      className="block max-w-full truncate text-left text-sm font-medium hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {run.name}
                    </button>
                    <p className="truncate text-xs text-muted">
                      {STRATEGY_NAMES[run.config.strategy.kind]} · {holdingsLabel(run.config)} · {dateRange(run.config.start, run.config.end)}
                    </p>
                    <p className={`text-xs font-medium tabular-nums ${run.summary.totalReturn >= 0 ? "text-gain" : "text-loss"}`}>
                      {formatPercent(run.summary.totalReturn)}
                      <span className="font-normal text-muted"> vs {formatPercent(run.summary.benchmarkTotalReturn)}</span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {run.stored
                        ? `Saved result · ${run.stored.engine.name === "python" ? "Python" : "TypeScript"} ${run.stored.engine.version} · ${run.stored.simulated ? "simulated" : "real"} prices`
                        : "Older run: settings only, no saved result"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(run)}
                    aria-label={`Delete ${run.name}`}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-foreground/5 hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4" aria-hidden>
                      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={selected.length < 2}
            onClick={onCompare}
            className="mt-3 h-10 w-full rounded-full border border-border text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent disabled:text-muted disabled:hover:bg-transparent"
          >
            {selected.length < 2 ? "Tick 2 to 4 runs to compare" : `Compare ${selected.length} runs`}
          </button>
        </>
      )}
    </Card>
  );
}
