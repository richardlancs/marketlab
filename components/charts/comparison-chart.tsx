"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { extent, linePath, nearestIndex, niceTicks, scaleY, toPoints } from "@/lib/chart";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";

// Drawing space for the SVG, stretched by CSS to the real size (see PriceChart).
const WIDTH = 1000;
const HEIGHT = 300;
const percentX = (x: number) => `${(x / WIDTH) * 100}%`;
const percentY = (y: number) => `${(y / HEIGHT) * 100}%`;

export interface ComparisonSeries {
  label: string;
  /** A CSS color, e.g. "var(--series-1)". */
  color: string;
  /** A dashed line, so the series differ by more than color alone. */
  dashed?: boolean;
  values: number[];
}

/**
 * Two or more lines over the same days on one dollar axis, e.g. a strategy
 * against its benchmark. Hover (or focus and use the arrow keys) to read every
 * series' value on a day. Identity never rests on color alone: there's a
 * legend, a label at the end of each line, and dashes on the second line.
 */
export function ComparisonChart({ times, series, label }: { times: number[]; series: ComparisonSeries[]; label: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const last = times.length - 1;

  const [low, high] = extent(series.flatMap((s) => s.values));
  const margin = (high - low) * 0.1 || 1;
  const domain: [number, number] = [low - margin, high + margin];
  const ticks = niceTicks(domain[0], domain[1], 4);
  const lines = series.map((s) => toPoints(s.values, WIDTH, HEIGHT, { domain }));

  // End labels sit just above each line's last point, pushed apart if they'd overlap.
  const endLabels = series
    .map((s, i) => ({ ...s, index: i, y: lines[i][last][1] }))
    .sort((a, b) => a.y - b.y)
    .map((l, i, all) => ({ ...l, y: i > 0 && l.y - all[i - 1].y < 24 ? all[i - 1].y + 24 : l.y }));

  function handlePointer(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setActiveIndex(nearestIndex((event.clientX - box.left) / box.width, times.length));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = activeIndex ?? last;
    const step = event.shiftKey ? 20 : 1; // Shift moves faster: there are up to ~1,300 days
    const next =
      event.key === "ArrowLeft" ? current - step : event.key === "ArrowRight" ? current + step : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (event.key === "Escape") return setActiveIndex(null);
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(Math.min(last, Math.max(0, next)));
  }

  const shownIndex = activeIndex ?? last;
  const describe = (i: number) => `${formatDate(times[i])}: ${series.map((s) => `${s.label} ${formatCurrency(s.values[i])}`).join(", ")}`;

  return (
    <figure>
      {/* The legend: always present for two or more series. */}
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        {/* Keyed by position: two series may share a label (two saved runs with the same name). */}
        {series.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <svg aria-hidden width="20" height="8" className="shrink-0">
              <line x1="1" x2="19" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={s.dashed ? "4 3" : undefined} />
            </svg>
            {s.label}
          </span>
        ))}
      </figcaption>

      <div className="relative mt-4 h-64 sm:h-80">
        <div className="absolute inset-y-0 left-0 right-16">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
            {ticks.map((tick) => {
              const y = scaleY(tick, HEIGHT, domain);
              return <line key={tick} x1={0} x2={WIDTH} y1={y} y2={y} stroke="var(--border)" vectorEffect="non-scaling-stroke" />;
            })}
            {lines.map((points, i) => (
              <path
                key={i}
                d={linePath(points)}
                fill="none"
                stroke={series[i].color}
                strokeWidth={2}
                strokeDasharray={series[i].dashed ? "6 4" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {activeIndex === null &&
            endLabels.map((l) => (
              <span
                key={l.index}
                aria-hidden
                // A card-colored backing keeps the text readable where it crosses a line.
                className="pointer-events-none absolute right-0 -translate-y-full rounded bg-surface/85 px-1 text-[11px] font-medium text-foreground"
                style={{ top: percentY(l.y) }}
              >
                {l.label}
              </span>
            ))}

          {activeIndex !== null && (
            <>
              <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25" style={{ left: percentX(lines[0][activeIndex][0]) }} />
              {lines.map((points, i) => (
                <div
                  key={i}
                  aria-hidden
                  // A 2px ring in the card's color keeps overlapping dots apart.
                  className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                  style={{ left: percentX(points[activeIndex][0]), top: percentY(points[activeIndex][1]), background: series[i].color }}
                />
              ))}
              {/* The tooltip flips to the left half once the pointer passes the middle. */}
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
                style={activeIndex > last / 2 ? { right: `calc(100% - ${percentX(lines[0][activeIndex][0])} + 12px)` } : { left: `calc(${percentX(lines[0][activeIndex][0])} + 12px)` }}
              >
                <p className="font-medium">{formatDate(times[activeIndex])}</p>
                {series.map((s, i) => (
                  <p key={i} className="mt-1 flex items-center gap-2 whitespace-nowrap">
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    <span className="text-muted">{s.label}</span>
                    <span className="ml-auto pl-3 font-medium tabular-nums">{formatCurrency(s.values[activeIndex])}</span>
                  </p>
                ))}
              </div>
            </>
          )}

          {/* The control layer, as in PriceChart: pointer, touch and arrow keys. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={`${label}. Use arrow keys to inspect, Shift to move faster.`}
            aria-valuemin={0}
            aria-valuemax={last}
            aria-valuenow={shownIndex}
            aria-valuetext={describe(shownIndex)}
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => setActiveIndex(null)}
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
            {formatCompactCurrency(tick)}
          </span>
        ))}
      </div>

      <div aria-hidden className="mt-2 flex justify-between pr-16 text-[11px] text-muted">
        <span>{formatDate(times[0])}</span>
        <span>{formatDate(times[last])}</span>
      </div>
    </figure>
  );
}
