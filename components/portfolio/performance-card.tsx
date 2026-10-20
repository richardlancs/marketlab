"use client";

import { useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { ROWS } from "@/components/backtest/backtest-results";
import { ComparisonChart } from "@/components/charts/comparison-chart";
import { TimeframePicker } from "@/components/charts/timeframe-picker";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { rebase } from "@/lib/portfolio-history";
import type { Timeframe } from "@/lib/types";
import { usePortfolioPerformance, type IndexChoice } from "./use-portfolio-performance";

/** The measures that make sense for a portfolio over a range ("Final value" of a rebased line wouldn't). */
const SHOWN = new Set(["Total return", "Annual return", "Max drawdown", "Volatility", "Sharpe ratio"]);
const METRIC_ROWS = ROWS.filter((row) => SHOWN.has(row.label));

/**
 * How the simulated portfolio has done over time, against a market index.
 * Both lines start at $100 ("growth of $100"), so they share one axis even
 * though the portfolio and the index are very different sizes. The numbers
 * are worked out on the server (app/api/portfolio/performance); this only
 * draws them.
 */
export function PerformanceCard() {
  const { account } = useAccount();
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");
  const [indexSymbol, setIndexSymbol] = useState<string | null>(null);
  const data = usePortfolioPerformance(account, indexSymbol, timeframe);

  const header = (indices: IndexChoice[] | null, selected: IndexChoice | null) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="performance" className="text-lg font-semibold tracking-tight">
        Performance
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        {indices && selected && (
          <label className="flex items-center gap-2 text-xs text-muted">
            Compare with
            <select
              value={selected.symbol}
              onChange={(e) => setIndexSymbol(e.target.value)}
              className="h-8 rounded-lg border border-border bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-accent"
            >
              {indices.map((index) => (
                <option key={index.symbol} value={index.symbol}>
                  {index.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <TimeframePicker value={timeframe} onChange={setTimeframe} />
      </div>
    </div>
  );

  if (!account || data.status === "loading") {
    return (
      <Card aria-labelledby="performance" aria-busy>
        {header(null, null)}
        <span className="sr-only">Loading performance…</span>
        <Skeleton className="mt-4 h-72" />
      </Card>
    );
  }
  if (data.status === "error") {
    return (
      <Card aria-labelledby="performance">
        {header(null, null)}
        <p className="mt-4 text-sm text-muted">{data.message}</p>
      </Card>
    );
  }
  const selected = data.index;
  if (data.status !== "ok") {
    return (
      <Card aria-labelledby="performance">
        {header(data.indices, selected)}
        <p className="mt-4 text-sm text-muted">
          {data.status === "missing-prices" ? "Some of your stocks have no price history, so the chart can’t be drawn." : "Not enough price history for this range yet."}
        </p>
      </Card>
    );
  }

  const { times, portfolio, firstTrade: first } = data;
  // A trade belongs to the latest close at or before it (see lib/portfolio-history.ts).
  const markerIndex = first === null ? -1 : times.findLastIndex((t) => t <= first);
  const yours = data.metrics.portfolio;
  const theirs = data.metrics.index;
  const values = rebase(portfolio);
  const benchmarkValues = rebase(data.indexValues);
  const monthEnds = times
    .map((time, i) => ({ time, i }))
    .filter(({ i }) => i === times.length - 1 || new Date(times[i]).getUTCMonth() !== new Date(times[i + 1]).getUTCMonth());

  return (
    <Card aria-labelledby="performance">
      {header(data.indices, selected)}
      <div className="mt-4">
        <ComparisonChart
          label={`Growth of $100: your portfolio compared with the ${selected.name}`}
          times={times}
          series={[
            { label: "Your portfolio", color: "var(--series-1)", values },
            { label: selected.name, color: "var(--series-2)", dashed: true, values: benchmarkValues },
          ]}
          marker={markerIndex > 0 ? { index: markerIndex, label: "First trade" } : undefined}
        />
      </div>
      <p className="mt-3 text-xs text-muted">
        Rebuilt from your trades and each day&apos;s closing prices, as growth of $100.{" "}
        {first === null
          ? "You haven't traded yet, so this is your starting holdings over time."
          : first > times[0] && `Before your first trade (${formatDate(first)}), it shows your starting holdings.`}
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Your portfolio compared with the {selected.name}</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 text-left font-medium">
                Measure
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                Your portfolio
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {selected.name}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {METRIC_ROWS.map((row) => {
              const a = row.cell(yours);
              const b = row.cell(theirs);
              return (
                <tr key={row.label}>
                  <th scope="row" className="py-2 text-left font-normal">
                    <span className="inline-flex items-center gap-1.5">
                      {row.label}
                      {row.term && <Explain term={row.term} />}
                    </span>
                  </th>
                  <td className={`py-2 pl-4 text-right font-medium ${a.className ?? ""}`}>{a.text}</td>
                  <td className={`py-2 pl-4 text-right ${b.className ?? ""}`}>{b.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The chart's numbers as a table, for screen readers and for reading exact values. */}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-accent">Value at each month end</summary>
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full tabular-nums">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr>
                <th scope="col" className="py-1.5 text-left font-medium">
                  Month end
                </th>
                <th scope="col" className="py-1.5 pl-4 text-right font-medium">
                  Your portfolio
                </th>
                <th scope="col" className="py-1.5 pl-4 text-right font-medium">
                  Growth of $100
                </th>
                <th scope="col" className="py-1.5 pl-4 text-right font-medium">
                  {selected.name}, growth of $100
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {monthEnds.map(({ time, i }) => (
                <tr key={time}>
                  <td className="py-1.5">{formatDate(time)}</td>
                  <td className="py-1.5 pl-4 text-right">{formatCurrency(portfolio[i])}</td>
                  <td className="py-1.5 pl-4 text-right">{formatCurrency(values[i])}</td>
                  <td className="py-1.5 pl-4 text-right">{formatCurrency(benchmarkValues[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
