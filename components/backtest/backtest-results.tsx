"use client";

import { useState } from "react";
import { ComparisonChart } from "@/components/charts/comparison-chart";
import { STRATEGY_NAMES, type BacktestConfig, type BacktestOutcome } from "@/lib/backtest/config";
import type { Metrics } from "@/lib/backtest/engine";
import { describeRuleSet } from "@/lib/backtest/rules";
import { ReturnHeatmap } from "./return-heatmap";
import { Explain } from "@/components/ui/explain";
import { formatCurrency, formatDate, formatPercent, formatShare } from "@/lib/format";
import type { TermKey } from "@/lib/glossary";

export const benchmarkName = (config: BacktestConfig) => (config.benchmark === "market" ? "S&P 500" : "Buy and hold");

/** "AAPL" or "AAPL 60% · MSFT 40%". */
export const holdingsLabel = (config: BacktestConfig) =>
  config.holdings.length === 1 ? config.holdings[0].symbol : config.holdings.map((h) => `${h.symbol} ${formatShare(h.weight).replace(".0%", "%")}`).join(" · ");

const tone = (value: number) => (value > 0.00005 ? "text-gain" : value < -0.00005 ? "text-loss" : "");

/** Each measure's ⓘ explanation comes from the glossary (lib/glossary.ts). */
export const ROWS: { label: string; term?: TermKey; cell: (m: Metrics) => { text: string; className?: string } }[] = [
  { label: "Final value", cell: (m) => ({ text: formatCurrency(m.finalValue) }) },
  { label: "Total return", term: "totalReturn", cell: (m) => ({ text: formatPercent(m.totalReturn), className: tone(m.totalReturn) }) },
  { label: "Annual return", term: "cagr", cell: (m) => ({ text: formatPercent(m.cagr), className: tone(m.cagr) }) },
  {
    label: "Max drawdown",
    term: "maxDrawdown",
    cell: (m) => ({ text: m.maxDrawdown > 0 ? `-${formatShare(m.maxDrawdown)}` : formatShare(0), className: m.maxDrawdown > 0 ? "text-loss" : "" }),
  },
  { label: "Volatility", term: "volatility", cell: (m) => ({ text: formatShare(m.volatility) }) },
  { label: "Sharpe ratio", term: "sharpe", cell: (m) => ({ text: m.sharpe === null ? "—" : m.sharpe.toFixed(2) }) },
  { label: "Trades", cell: (m) => ({ text: String(m.trades) }) },
  { label: "Time invested", term: "exposure", cell: (m) => ({ text: formatShare(m.exposure) }) },
];

const TRADES_SHOWN = 20;

export function BacktestResults({ config, outcome }: { config: BacktestConfig; outcome: BacktestOutcome }) {
  const [allTrades, setAllTrades] = useState(false);
  const { run, benchmark } = outcome;
  const times = run.equity.map((p) => p.time);
  const strategyName = STRATEGY_NAMES[config.strategy.kind];
  const other = benchmarkName(config);
  const beat = run.metrics.finalValue >= benchmark.metrics.finalValue;

  // One row per month end, as the table view of the chart.
  const monthEnds = run.equity.filter((p, i) => i === run.equity.length - 1 || new Date(p.time).getUTCMonth() !== new Date(run.equity[i + 1].time).getUTCMonth());
  const benchmarkAt = new Map(benchmark.equity.map((p) => [p.time, p.price]));
  const trades = allTrades ? run.trades : run.trades.slice(0, TRADES_SHOWN);

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <span className="font-medium">{strategyName}</span> on {holdingsLabel(config)} turned {formatCurrency(config.initialCash)} into{" "}
        <span className="font-medium">{formatCurrency(run.metrics.finalValue)}</span> ({formatPercent(run.metrics.totalReturn)}), {beat ? "ahead of" : "behind"}{" "}
        {other.toLowerCase() === "buy and hold" ? "buying and holding" : "the S&P 500"} at {formatCurrency(benchmark.metrics.finalValue)} (
        {formatPercent(benchmark.metrics.totalReturn)}), from {formatDate(times[0])} to {formatDate(times[times.length - 1])}.
      </p>
      {config.strategy.kind === "rules" && (
        <p className="-mt-3 text-sm text-muted">
          Buy when {describeRuleSet(config.strategy.entry)}. Sell when {describeRuleSet(config.strategy.exit)}.
        </p>
      )}

      <ComparisonChart
        label={`Portfolio value: ${strategyName} compared with ${other}`}
        times={times}
        series={[
          { label: strategyName, color: "var(--series-1)", values: run.equity.map((p) => p.price) },
          { label: other, color: "var(--series-2)", dashed: true, values: benchmark.equity.map((p) => p.price) },
        ]}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Results compared with the benchmark</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 text-left font-medium">
                Measure
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {strategyName}
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {other}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((row) => {
              const a = row.cell(run.metrics);
              const b = row.cell(benchmark.metrics);
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
        {run.metrics.drawdownPeak !== null && run.metrics.drawdownTrough !== null && (
          <p className="mt-2 text-xs text-muted">
            The strategy&apos;s worst drawdown ran from {formatDate(run.metrics.drawdownPeak)} to {formatDate(run.metrics.drawdownTrough)}.
          </p>
        )}
      </div>

      <ReturnHeatmap run={run} benchmark={benchmark} strategyName={strategyName} benchmarkName={other} />

      {/* The chart's numbers as a table, for screen readers and for reading exact values. */}
      <details className="group text-sm">
        <summary className="cursor-pointer font-medium text-accent">Value at each month end</summary>
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full tabular-nums">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr>
                <th scope="col" className="py-1.5 text-left font-medium">
                  Month end
                </th>
                <th scope="col" className="py-1.5 pl-4 text-right font-medium">
                  {strategyName}
                </th>
                <th scope="col" className="py-1.5 pl-4 text-right font-medium">
                  {other}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {monthEnds.map((p) => (
                <tr key={p.time}>
                  <td className="py-1.5">{formatDate(p.time)}</td>
                  <td className="py-1.5 pl-4 text-right">{formatCurrency(p.price)}</td>
                  <td className="py-1.5 pl-4 text-right">{formatCurrency(benchmarkAt.get(p.time) ?? Number.NaN)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div>
        <h3 className="text-sm font-semibold">Trades</h3>
        {run.trades.length === 0 ? (
          <p className="mt-2 text-sm text-muted">This strategy never traded in this period.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Trades the strategy made, oldest first</caption>
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="py-1.5 text-left font-medium">
                    Date
                  </th>
                  <th scope="col" className="py-1.5 text-left font-medium">
                    Trade
                  </th>
                  <th scope="col" className="py-1.5 pl-4 text-right font-medium">
                    Shares
                  </th>
                  <th scope="col" className="py-1.5 pl-4 text-right font-medium">
                    Price
                  </th>
                  <th scope="col" className="py-1.5 pl-4 text-right font-medium">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trades.map((t, i) => (
                  <tr key={i}>
                    <td className="py-1.5 whitespace-nowrap">{formatDate(t.time)}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      <span className={`font-medium ${t.side === "buy" ? "text-accent" : "text-loss"}`}>{t.side === "buy" ? "Buy" : "Sell"}</span> {t.symbol}
                    </td>
                    <td className="py-1.5 pl-4 text-right">{t.shares.toFixed(3)}</td>
                    <td className="py-1.5 pl-4 text-right">{formatCurrency(t.price)}</td>
                    <td className="py-1.5 pl-4 text-right">{formatCurrency(t.shares * t.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {run.trades.length > TRADES_SHOWN && (
              <button type="button" onClick={() => setAllTrades(!allTrades)} className="mt-2 text-sm font-medium text-accent hover:underline">
                {allTrades ? "Show fewer" : `Show all ${run.trades.length} trades`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
