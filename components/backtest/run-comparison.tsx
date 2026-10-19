"use client";

import { ComparisonChart } from "@/components/charts/comparison-chart";
import { STRATEGY_NAMES, type BacktestOutcome, type SavedRun } from "@/lib/backtest/config";
import { formatDate } from "@/lib/format";
import { holdingsLabel, ROWS } from "./backtest-results";

/** Categorical colors in fixed order (validated for colorblind separation); every other line dashed. */
const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

/**
 * Several saved runs side by side. The chart shows "growth of $100" over the
 * days every run covers, so runs with different starting cash or dates can
 * be compared fairly; the table shows each run's own full results.
 */
export function RunComparison({ runs, outcomes }: { runs: SavedRun[]; outcomes: BacktestOutcome[] }) {
  // The days all runs share.
  const sets = outcomes.map((o) => new Set(o.run.equity.map((p) => p.time)));
  const times = outcomes[0].run.equity.map((p) => p.time).filter((t) => sets.every((s) => s.has(t)));

  return (
    <div className="space-y-6">
      {times.length >= 2 ? (
        <>
          <p className="text-sm text-muted">
            Growth of $100 from {formatDate(times[0])} to {formatDate(times[times.length - 1])}, the dates all {runs.length} runs cover.
          </p>
          <ComparisonChart
            label={`Growth of $100: ${runs.map((r) => r.name).join(", ")}`}
            times={times}
            series={outcomes.map((o, i) => {
              const byTime = new Map(o.run.equity.map((p) => [p.time, p.price]));
              const base = byTime.get(times[0]) as number;
              return {
                label: runs[i].name,
                color: COLORS[i],
                dashed: i % 2 === 1,
                values: times.map((t) => ((byTime.get(t) as number) / base) * 100),
              };
            })}
          />
        </>
      ) : (
        <p className="text-sm text-muted">These runs don&apos;t share any dates, so there&apos;s no common chart. Their results are below.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Results of each compared run</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 text-left font-medium">
                Measure
              </th>
              {runs.map((run, i) => (
                <th key={i} scope="col" className="py-2 pl-2 text-right align-bottom font-medium sm:pl-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="max-w-20 truncate text-foreground sm:max-w-32">{run.name}</span>
                  </span>
                  {/* The details repeat the default name, so phones (narrow columns) skip them. */}
                  <span className="hidden font-normal sm:block">{STRATEGY_NAMES[run.config.strategy.kind]}</span>
                  <span className="hidden font-normal sm:block">{holdingsLabel(run.config)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="py-2 text-left font-normal">
                  {row.label}
                </th>
                {outcomes.map((o, i) => {
                  const cell = row.cell(o.run.metrics);
                  return (
                    <td key={i} className={`py-2 pl-2 text-right sm:pl-4 ${cell.className ?? ""}`}>
                      {cell.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
