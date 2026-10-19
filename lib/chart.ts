/**
 * Chart geometry: turns prices into SVG path strings. Pure math with no React,
 * so it can be unit tested and shared by the sparklines and the big chart.
 *
 * SVG coordinates start at the top-left corner and y grows downward, so a
 * higher price must map to a *smaller* y.
 */

import { TIMEFRAMES, TIMEFRAME_SPAN, type PricePoint, type Timeframe } from "./types";

export type Point = [x: number, y: number];

/** The smallest and largest value. */
export function extent(values: number[]): [min: number, max: number] {
  return [Math.min(...values), Math.max(...values)];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Spreads `values` evenly across `width` and scales them into `height`.
 * `padding` keeps the line from touching the top and bottom edges, where a
 * thick stroke would get cut off. `domain` is the price range mapped to the
 * full height; pass a wider one to fit extra lines (like a baseline) in view.
 */
export function toPoints(
  values: number[],
  width: number,
  height: number,
  { padding = 0, domain = extent(values) }: { padding?: number; domain?: [number, number] } = {},
): Point[] {
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, i) => [round2(i * stepX), scaleY(value, height, domain, padding)]);
}

/** The y coordinate for a single value: the vertical half of `toPoints`, for gridlines and markers. */
export function scaleY(value: number, height: number, [min, max]: [number, number], padding = 0): number {
  const top = padding;
  const bottom = height - padding;
  // A flat series (min === max) would divide by zero; draw it across the middle.
  const t = max === min ? 0.5 : (value - min) / (max - min);
  return round2(bottom - t * (bottom - top));
}

/** "M0,10L5,3L10,7": move to the first point, then draw a line to each next one. */
export function linePath(points: Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join("");
}

/** The line, then down to the bottom edge and back, closed: the shape under the line. */
export function areaPath(points: Point[], height: number): string {
  if (points.length === 0) return "";
  const firstX = points[0][0];
  const lastX = points[points.length - 1][0];
  return `${linePath(points)}L${lastX},${height}L${firstX},${height}Z`;
}

/**
 * Round-number gridline values, roughly `count` of them, inside [min, max].
 * Steps are 1, 2, 2.5 or 5 times a power of ten, so labels read like
 * "245, 247.5, 250" rather than "243.17, 245.32, …".
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  const rough = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // Float math is slightly off (0.3 / 3 = 0.10000000000000002), so comparisons
  // allow a tiny tolerance instead of letting 0.1 count as "too small".
  const epsilon = 1e-9;
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough * (1 - epsilon)) ?? 10 * magnitude;

  const ticks: number[] = [];
  for (let i = Math.ceil(min / step - epsilon); i * step <= max + step * epsilon; i++) {
    // Multiplying (instead of adding step repeatedly) avoids piling up float error;
    // toPrecision cleans up leftovers like 0.30000000000000004.
    ticks.push(Number((i * step).toPrecision(12)));
  }
  return ticks;
}

/** Which of `length` evenly spaced points is closest to a position `ratio` (0–1) across the chart. */
export function nearestIndex(ratio: number, length: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.round(clamped * (length - 1));
}

/**
 * The part of a daily history covering `timeframe`, by calendar date: "1Y"
 * runs from the same date a year before the last point. It starts at the last
 * point on or before that date, so the range's change is measured from the
 * close that was current then (the date itself may be a weekend). "1D" is the
 * last two closes: today's change.
 */
export function sliceTimeframe<T extends { time: number }>(history: T[], timeframe: Timeframe): T[] {
  if (history.length === 0) return history;
  const span = TIMEFRAME_SPAN[timeframe];
  if (timeframe === "1D") return history.slice(-2);
  const end = new Date(history[history.length - 1].time);
  const cutoff =
    "days" in span
      ? Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - span.days, 23, 59)
      : Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - span.months, end.getUTCDate(), 23, 59);
  let start = 0;
  while (start + 1 < history.length && history[start + 1].time <= cutoff) start++;
  return history.slice(start);
}

/** A small chart's values for every timeframe, so it can switch ranges in the browser without the whole history. */
export type TrendSeries = Record<Timeframe, number[]>;

/** Small charts are a few dozen pixels wide: more points than this add nothing but bytes. */
const TREND_POINTS = 48;

/**
 * The values a small chart needs for each timeframe, thinned out to at most
 * TREND_POINTS (always keeping the first and last, so each range's change is
 * exact). Done on the server, so only a few hundred numbers per stock reach
 * the browser instead of five years of closes.
 */
export function trendSeries(history: readonly PricePoint[]): TrendSeries {
  const thin = (values: number[]) => {
    if (values.length <= TREND_POINTS) return values;
    const step = (values.length - 1) / (TREND_POINTS - 1);
    return Array.from({ length: TREND_POINTS }, (_, i) => values[Math.round(i * step)]);
  };
  return Object.fromEntries(TIMEFRAMES.map((tf) => [tf, thin(sliceTimeframe([...history], tf).map((p) => p.price))])) as TrendSeries;
}
