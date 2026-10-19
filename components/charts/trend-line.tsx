"use client";

import type { TrendSeries } from "@/lib/chart";
import { formatPercent } from "@/lib/format";
import { Sparkline } from "./sparkline";
import { TimeframePicker } from "./timeframe-picker";
import { useTrendRange } from "./trend-range";

/**
 * A small trend line for the chosen range (see trend-range.tsx), green if
 * it ended higher than it started and red if lower, with that change written
 * beside it ("1M +4.2%"), so the color always has a number that agrees with it.
 */
export function TrendLine({ series, className = "", label = true }: { series: TrendSeries; className?: string; label?: boolean }) {
  const { range } = useTrendRange();
  const values = series[range];
  const first = values[0];
  const last = values[values.length - 1];
  const change = first ? last / first - 1 : 0;
  const tone = last >= first ? "text-gain" : "text-loss";
  return (
    <span className={`flex flex-col items-stretch ${className}`}>
      <Sparkline values={values} baseline={first} className={`min-h-0 flex-1 ${tone}`} />
      {label && (
        <span className={`mt-0.5 text-right text-[10px] leading-none font-medium tabular-nums ${tone}`}>
          {range} {formatPercent(change)}
        </span>
      )}
    </span>
  );
}

/** The range picker for pages with small charts but no big one (the stocks table, the watchlist). */
export function TrendRangePicker() {
  const { range, setRange } = useTrendRange();
  return <TimeframePicker value={range} onChange={setRange} label="Trend range" />;
}
