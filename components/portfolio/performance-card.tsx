"use client";

import { useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { ROWS } from "@/components/backtest/backtest-results";
import { ComparisonChart } from "@/components/charts/comparison-chart";
import { TimeframePicker } from "@/components/charts/timeframe-picker";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { computeMetrics } from "@/lib/backtest/engine";
import { sliceTimeframe } from "@/lib/chart";
import { formatCurrency, formatDate } from "@/lib/format";
import { firstTradeTime, portfolioValueSeries, rebase } from "@/lib/portfolio-history";
import type { PricePoint, Timeframe } from "@/lib/types";
import { usePortfolioHistory, type IndexHistory } from "./use-portfolio-history";

/** The measures that make sense for a portfolio over a range ("Final value" of a rebased line wouldn't). */
const SHOWN = new Set(["Total return", "Annual return", "Max drawdown", "Volatility", "Sharpe ratio"]);
const METRIC_ROWS = ROWS.filter((row) => SHOWN.has(row.label));

/**
 * How the simulated portfolio has done over time, against a market index.
 * Both lines start at $100 ("growth of $100"), so they share one axis even
 * though the portfolio and the index are very different sizes.
 */
export function PerformanceCard() {
  const { account } = useAccount();
  const data = usePortfolioHistory(account);
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");
  const [indexSymbol, setIndexSymbol] = useState<string | null>(null);

  const header = (indices: IndexHistory[] | null, selected: IndexHistory | null) => (
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

  const selected = data.indices.find((i) => i.symbol === indexSymbol) ?? data.indices[0];
  // The index's trading days are the chart's days.
  const benchmarkPoints = sliceTimeframe(selected.history, timeframe);
  const times = benchmarkPoints.map((p) => p.time);
  let portfolio: PricePoint[];
  try {
    portfolio = portfolioValueSeries(account, data.history, times);
  } catch {
    return (
      <Card aria-labelledby="performance">
        {header(data.indices, selected)}
        <p className="mt-4 text-sm text-muted">Some of your stocks have no price history, so the chart can&apos;t be drawn.</p>
      </Card>
    );
  }
  if (times.length < 2) {
    return (
      <Card aria-labelledby="performance">
        {header(data.indices, selected)}
        <p className="mt-4 text-sm text-muted">Not enough price history for this range yet.</p>
      </Card>
    );
  }

  const first = firstTradeTime(account);
  // A trade belongs to the latest close at or before it (see lib/portfolio-history.ts).
  const markerIndex = first === null ? -1 : times.findLastIndex((t) => t <= first);
  const tradesInRange = account.trades.filter((t) => t.time >= times[0]).length;
  const yours = computeMetrics(portfolio, tradesInRange, 1);
  const theirs = computeMetrics(benchmarkPoints, 0, 1);
  const values = rebase(portfolio.map((p) => p.price));
  const benchmarkValues = rebase(benchmarkPoints.map((p) => p.price));
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
                    {row.label}
                    {row.help && <span className="block text-xs text-muted">{row.help}</span>}
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
                  <td className="py-1.5 pl-4 text-right">{formatCurrency(portfolio[i].price)}</td>
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
