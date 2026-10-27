"use client";

import { useState } from "react";
import { Explain } from "@/components/ui/explain";
import { runLuckAction } from "@/lib/backtest-actions";
import type { BacktestConfig } from "@/lib/backtest/config";
import { RandomVersions, SharpeRangeView } from "@/components/analytics/luck-views";
import { luckVerdict, type LuckResult } from "@/lib/backtest/luck";

type State = { status: "idle" } | { status: "running" } | { status: "error"; message: string } | { status: "done"; result: LuckResult };

/**
 * "Was it luck?" under a backtest's results: on request, the analytics
 * service runs 1,000 random versions of the strategy and resamples its daily
 * returns (lib/backtest/luck.ts). A saved run is checked on the prices it was
 * saved with.
 */
export function LuckCard({ config, savedRunId, strategyName, benchmarkName }: { config: BacktestConfig; savedRunId?: string; strategyName: string; benchmarkName: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function check() {
    setState({ status: "running" });
    try {
      const outcome = await runLuckAction(config, savedRunId);
      setState(outcome.ok ? { status: "done", result: outcome.result } : { status: "error", message: outcome.message });
    } catch {
      setState({ status: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  return (
    <section aria-labelledby="luck-heading" className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="luck-heading" className="flex items-center gap-1.5 text-sm font-semibold">
            Was it luck? <Explain term="luck" />
          </h3>
          <p className="text-xs text-muted">How this run compares with random versions of itself, and how sure its Sharpe ratio is.</p>
        </div>
        {state.status !== "done" && (
          <button
            type="button"
            onClick={check}
            disabled={state.status === "running"}
            className="h-9 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {state.status === "running" ? "Checking…" : "Was it luck?"}
          </button>
        )}
      </div>
      {state.status === "running" && <div aria-busy className="mt-4 h-40 animate-pulse rounded-lg bg-foreground/[0.06]" />}
      {state.status === "error" && (
        <p role="alert" className="mt-3 text-sm text-loss">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <div className="mt-4 space-y-6">
          {state.result.comparison && (
            <RandomVersions
              c={state.result.comparison}
              verdict={luckVerdict(state.result.comparison)}
              lineName={strategyName.toLowerCase()}
              method={
                <>
                  {state.result.comparison.kind === "timing"
                    ? "Each random version holds each stock for as many separate stretches and as many days as the strategy did, at random dates."
                    : "Each random version rebalances on the strategy's days with its weights, but hands them to the stocks in a random order."}{" "}
                  They and this run are valued the same simple way (each day&apos;s weighted return, less costs when positions change), so the line can sit slightly apart from the result above.
                </>
              }
            />
          )}
          {state.result.sharpeRange && <SharpeRangeView r={state.result.sharpeRange} benchmarkName={benchmarkName} />}
          {state.result.notes.map((note) => (
            <p key={note} className="text-sm text-muted">
              {note}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
