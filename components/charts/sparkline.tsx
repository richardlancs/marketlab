import { useId } from "react";
import { areaPath, extent, linePath, scaleY, sliceTimeframe, toPoints } from "@/lib/chart";
import type { PricePoint } from "@/lib/types";

// The drawing is done in this fixed coordinate space, then stretched by CSS to
// whatever size the parent gives the <svg>.
const WIDTH = 100;
const HEIGHT = 32;
const PADDING = 2;

interface SparklineProps {
  values: number[];
  /** Drawn as a dotted line, e.g. yesterday's close. Kept in view even when prices never reach it. */
  baseline?: number;
  className?: string;
}

/**
 * A small trend line with a soft gradient fill. Server Component: it's pure
 * SVG, so no JavaScript is sent to the browser for it.
 *
 * The color comes from CSS `color` (set `text-gain` or `text-loss` on it), and
 * the stroke and gradient use `currentColor`, so it follows the theme.
 */
export function Sparkline({ values, baseline, className = "" }: SparklineProps) {
  // Each gradient needs an id that's unique on the page. useId gives one that
  // matches between the server render and the browser.
  const gradientId = useId();

  const domain = extent(baseline === undefined ? values : [...values, baseline]);
  const points = toPoints(values, WIDTH, HEIGHT, { padding: PADDING, domain });
  const baselineY = baseline === undefined ? undefined : scaleY(baseline, HEIGHT, domain, PADDING);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      // "none" lets the chart stretch to fill its box instead of keeping its proportions.
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>

      {baselineY !== undefined && (
        <line
          x1={0}
          x2={WIDTH}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--muted)"
          strokeOpacity={0.5}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={areaPath(points, HEIGHT)} fill={`url(#${gradientId})`} />
      <path
        d={linePath(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        // Without this, stretching the SVG would also stretch the line's thickness.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The last month of a daily history as a sparkline, green or red by the
 * month's direction, with a dotted line at the month's starting price.
 */
export function MonthSparkline({ history, className = "" }: { history: PricePoint[]; className?: string }) {
  const values = sliceTimeframe(history, "1M").map((p) => p.price);
  const up = values[values.length - 1] >= values[0];
  return <Sparkline values={values} baseline={values[0]} className={`${up ? "text-gain" : "text-loss"} ${className}`} />;
}
