"use client";

import { useState } from "react";
import { HeatTable, type HeatRow } from "@/components/charts/heat-table";
import type { BacktestRun } from "@/lib/backtest/engine";
import { periodReturns, type MonthReturn, type YearReturn } from "@/lib/backtest/periods";
import { formatPercent } from "@/lib/format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Show = "strategy" | "benchmark" | "difference";

function toRows(months: MonthReturn[], years: YearReturn[]): HeatRow[] {
  return years.map((y) => {
    const ofYear = months.filter((m) => m.year === y.year);
    const cell = (month: number) => ofYear.find((m) => m.month === month);
    return {
      label: String(y.year),
      cells: [...MONTHS.map((_, month) => cell(month)?.value ?? null), y.value],
      notes: [...MONTHS.map((_, month) => (cell(month)?.partial ? "partial month" : undefined)), y.partial ? "partial year" : undefined],
    };
  });
}

/** Month-by-month and year-by-year returns: which stretches made or lost the money. */
export function ReturnHeatmap({ run, benchmark, strategyName, benchmarkName }: { run: BacktestRun; benchmark: BacktestRun; strategyName: string; benchmarkName: string }) {
  const [show, setShow] = useState<Show>("strategy");
  const ours = periodReturns(run.equity);
  const theirs = periodReturns(benchmark.equity);
  const ourRows = toRows(ours.months, ours.years);
  const theirRows = toRows(theirs.months, theirs.years);
  // Both runs cover exactly the same days, so their rows and cells line up.
  const rows =
    show === "strategy"
      ? ourRows
      : show === "benchmark"
        ? theirRows
        : ourRows.map((row, r) => ({ ...row, cells: row.cells.map((v, c) => (v === null || theirRows[r]?.cells[c] == null ? null : v - (theirRows[r].cells[c] as number))) }));
  const names: Record<Show, string> = { strategy: strategyName, benchmark: benchmarkName, difference: "Difference" };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Returns by month</h3>
        <div role="group" aria-label="Show returns of" className="flex gap-1 text-xs">
          {(Object.keys(names) as Show[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={show === key}
              onClick={() => setShow(key)}
              className="rounded-full px-3 py-1 font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent aria-pressed:bg-foreground/[0.08] aria-pressed:text-foreground"
            >
              {names[key]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        {show === "difference" ? `${strategyName} minus ${benchmarkName}, in percentage points.` : "Green for gains, red for losses; darker means bigger."} The first and last months may be partial.
      </p>
      <div className="mt-3">
        <HeatTable caption={`Returns by month and year: ${names[show]}`} corner="Year" columns={[...MONTHS, "Year"]} rows={rows} format={formatPercent} />
      </div>
    </div>
  );
}
