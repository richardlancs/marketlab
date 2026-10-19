"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChangeBadge } from "@/components/ui/change-badge";
import { areaPath, extent, linePath, nearestIndex, niceTicks, scaleY, sliceTimeframe, toPoints } from "@/lib/chart";
import { formatAxisValue, formatCurrency, formatDate, formatShortDate } from "@/lib/format";
import type { PricePoint, Timeframe } from "@/lib/types";
import { TimeframePicker } from "./timeframe-picker";
import { useTrendRange } from "./trend-range";

// Drawing space for the SVG, stretched by CSS to the real size (see Sparkline).
const WIDTH = 1000;
const HEIGHT = 300;

const RANGE_LABELS: Record<Timeframe, string> = {
  "1D": "Today",
  "1W": "Past week",
  "1M": "Past month",
  "6M": "Past 6 months",
  "1Y": "Past year",
  "5Y": "Past 5 years",
};

/** Points are daily; within a month the year is obvious, beyond that it isn't. */
const formatPointTime = (time: number, timeframe: Timeframe) => (timeframe === "1D" || timeframe === "1W" || timeframe === "1M" ? formatShortDate(time) : formatDate(time));

/** Converts SVG coordinates to CSS percentages, for HTML laid over the chart. */
const percentX = (x: number) => `${(x / WIDTH) * 100}%`;
const percentY = (y: number) => `${(y / HEIGHT) * 100}%`;

interface PriceChartProps {
  /** Daily closes, oldest first; the chart shows the slice for the chosen timeframe. */
  history: PricePoint[];
  /** Today's move against yesterday's close, shown next to the range's change. */
  today: { change: number; percent: number };
  /**
   * Shown on the left of the top row. It's rendered by the Server Component
   * that uses this chart and passed in already finished, so it adds no
   * JavaScript to this Client Component.
   */
  title: ReactNode;
}

/**
 * The interactive area chart. This is a Client Component because it keeps
 * state (the timeframe, the hovered point) and responds to events. It's
 * still rendered to HTML on the server first; the browser then "hydrates" it,
 * attaching the event handlers.
 */
export function PriceChart({ history, today, title }: PriceChartProps) {
  // Shared with every small chart on the site (see trend-range.tsx).
  const { range: timeframe, setRange: setTimeframe } = useTrendRange();
  // The point under the pointer (or chosen with arrow keys), or null when idle.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId();

  const points = sliceTimeframe(history, timeframe);
  const values = points.map((p) => p.price);
  const last = points.length - 1;
  // Each range is measured against its first point.
  const reference = values[0];

  // Leave 10% empty space above and below so the line never touches the edges.
  const [low, high] = extent([...values, reference]);
  const margin = (high - low) * 0.1 || 1;
  const domain: [number, number] = [low - margin, high + margin];

  const coords = toPoints(values, WIDTH, HEIGHT, { domain });
  const ticks = niceTicks(domain[0], domain[1], 4);
  const referenceY = scaleY(reference, HEIGHT, domain);

  const shown = points[activeIndex ?? last];
  const change = shown.price - reference;
  // The line's color reflects the whole range, so it doesn't flicker while hovering.
  const tone = values[last] >= reference ? "text-gain" : "text-loss";
  const active = activeIndex === null ? null : coords[activeIndex];

  function selectTimeframe(next: Timeframe) {
    setTimeframe(next);
    setActiveIndex(null);
  }

  function handlePointer(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setActiveIndex(nearestIndex((event.clientX - box.left) / box.width, points.length));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = activeIndex ?? last;
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = current - 1;
        break;
      case "ArrowRight":
        next = current + 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Escape":
        setActiveIndex(null);
        return;
      default:
        return; // Leave other keys (like Tab) alone.
    }
    event.preventDefault(); // Stop arrow keys from scrolling the page.
    setActiveIndex(Math.min(last, Math.max(0, next)));
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {title}
        <TimeframePicker value={timeframe} onChange={selectTimeframe} />
      </div>

      {/* The headline shows the hovered point while hovering, otherwise the latest price. */}
      <div className="mt-4">
        <p className="text-4xl font-semibold tracking-tight sm:text-5xl">{formatCurrency(shown.price)}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm">
          <ChangeBadge change={change} percent={change / reference} currency />
          <span className="text-muted">
            {activeIndex === null ? RANGE_LABELS[timeframe] : formatPointTime(shown.time, timeframe)}
          </span>
          {activeIndex === null && (
            <>
              <span aria-hidden className="text-muted">
                ·
              </span>
              <ChangeBadge change={today.change} percent={today.percent} currency />
              <span className="text-muted">Today</span>
            </>
          )}
        </p>
      </div>

      <div className={`relative mt-6 h-56 sm:h-72 ${tone}`}>
        {/* The plot area. The 3.5rem on the right is a gutter for the price labels. */}
        <div className="absolute inset-y-0 left-0 right-14">
          {/* Gridlines and the reference line. These don't animate. */}
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden
            className="absolute inset-0 size-full overflow-visible"
          >
            {ticks.map((tick) => {
              const y = scaleY(tick, HEIGHT, domain);
              return <line key={tick} x1={0} x2={WIDTH} y1={y} y2={y} stroke="var(--border)" vectorEffect="non-scaling-stroke" />;
            })}
            <line
              x1={0}
              x2={WIDTH}
              y1={referenceY}
              y2={referenceY}
              stroke="var(--muted)"
              strokeOpacity={0.6}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/*
           * The price line. `key={timeframe}` makes React treat each timeframe
           * as a brand-new element, so the reveal animation replays on switch.
           */}
          <svg
            key={timeframe}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden
            className="absolute inset-0 size-full animate-reveal overflow-visible"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={areaPath(coords, HEIGHT)} fill={`url(#${gradientId})`} />
            <path
              d={linePath(coords)}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/*
           * The crosshair and dot are HTML, not SVG: the SVG is stretched
           * unevenly, which would squash a circle into an oval.
           */}
          {active && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25"
                style={{ left: percentX(active[0]) }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-surface"
                style={{ left: percentX(active[0]), top: percentY(active[1]) }}
              />
            </>
          )}

          {/*
           * An invisible layer on top that catches the pointer and keyboard.
           * role="slider" tells screen readers it's a control you move with
           * arrow keys; aria-valuetext is what they read out at each step.
           * touch-pan-y lets a finger scroll the page vertically but scrub sideways.
           */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={`Price history, ${RANGE_LABELS[timeframe].toLowerCase()}. Use arrow keys to inspect.`}
            aria-valuemin={0}
            aria-valuemax={last}
            aria-valuenow={activeIndex ?? last}
            aria-valuetext={`${formatPointTime(shown.time, timeframe)}: ${formatCurrency(shown.price)}`}
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => setActiveIndex(null)}
            // A mouse keeps hovering after a click; a finger lifting off is "done".
            onPointerUp={(event) => event.pointerType !== "mouse" && setActiveIndex(null)}
            onKeyDown={handleKeyDown}
            onBlur={() => setActiveIndex(null)}
            className="absolute inset-0 cursor-crosshair touch-pan-y rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          />
        </div>

        {ticks.map((tick) => (
          <span
            key={tick}
            aria-hidden
            className="pointer-events-none absolute right-0 -translate-y-1/2 text-[11px] text-muted tabular-nums"
            style={{ top: percentY(scaleY(tick, HEIGHT, domain)) }}
          >
            {formatAxisValue(tick)}
          </span>
        ))}
      </div>

      <div aria-hidden className="mt-2 flex justify-between pr-14 text-[11px] text-muted">
        <span>{formatPointTime(points[0].time, timeframe)}</span>
        <span>{formatPointTime(points[last].time, timeframe)}</span>
      </div>
    </div>
  );
}
