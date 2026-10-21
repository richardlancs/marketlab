"use client";

import { useId, type ReactNode } from "react";
import { extent, linePath, niceTicks, scaleY, toPoints } from "@/lib/chart";

/** The card every demo sits in: a title, the demo, and a note that its prices are made up. */
export function DemoFrame({ title, children, note = "Generated prices for illustration, not market data." }: { title: string; children: ReactNode; note?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-linear-to-b from-surface-raised to-surface p-4 shadow-sm shadow-black/[0.03] sm:p-5">
      <p className="font-semibold">{title}</p>
      <div className="mt-4 space-y-5">{children}</div>
      {note && <p className="mt-4 text-xs text-muted">{note}</p>}
    </div>
  );
}

/** A labeled range slider showing its current value. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <output htmlFor={id} className="font-medium tabular-nums">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format(value)}
        className="mt-2 h-6 w-full accent-accent"
      />
    </div>
  );
}

/** A row of buttons choosing one option, like the timeframe picker. */
export function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full bg-foreground/5 p-0.5 text-xs font-semibold">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className="rounded-full px-3 py-1.5 text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-sm dark:aria-pressed:bg-white/15"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A small headline number with a label. `tone` colors it as a gain or loss. */
export function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "gain" | "loss"; hint?: string }) {
  return (
    <div className="rounded-xl bg-foreground/[0.04] px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const StatRow = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;

export interface DemoSeries {
  label: string;
  values: readonly number[];
  color: string;
  dashed?: boolean;
}

const WIDTH = 1000;
const HEIGHT = 300;
const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/**
 * A simple line chart for demos: one or more series over the same days, with
 * gridlines and value labels. Optional extras: a shaded stretch of days
 * (e.g. a drawdown), horizontal bands (RSI's 30–70), and labeled markers.
 * It's a picture of what the numbers around it say, so it's hidden from
 * screen readers in favor of a one-line `summary`.
 */
export function DemoChart({
  series,
  summary,
  format = (v) => v.toFixed(0),
  domain: fixedDomain,
  shade,
  bands = [],
  markers = [],
  height = "h-56 sm:h-64",
}: {
  series: DemoSeries[];
  summary: string;
  format?: (value: number) => string;
  domain?: [number, number];
  shade?: { from: number; to: number; label?: string };
  bands?: { from: number; to: number; label?: string }[];
  markers?: { index: number; label: string }[];
  height?: string;
}) {
  const finite = series.flatMap((s) => s.values.filter(Number.isFinite));
  const [low, high] = fixedDomain ?? extent(finite);
  const margin = fixedDomain ? 0 : (high - low) * 0.08 || 1;
  const domain: [number, number] = [low - margin, high + margin];
  const ticks = niceTicks(domain[0], domain[1], 4).filter((t) => t >= domain[0] && t <= domain[1]);
  const length = Math.max(...series.map((s) => s.values.length));
  const x = (index: number) => (length > 1 ? (index / (length - 1)) * WIDTH : 0);

  // Leading NaNs (an average still warming up) start the line later instead of at zero.
  const paths = series.map((s) => {
    const first = s.values.findIndex(Number.isFinite);
    if (first < 0) return "";
    const points = toPoints(s.values.slice(first) as number[], WIDTH - x(first), HEIGHT, { domain }).map(([px, py]) => [px + x(first), py] as [number, number]);
    return linePath(points);
  });

  return (
    <figure>
      {series.length > 1 && (
        <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <svg aria-hidden width="20" height="8" className="shrink-0">
                <line x1="1" x2="19" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={s.dashed ? "4 3" : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
      <p className="sr-only">{summary}</p>
      <div aria-hidden className={`relative mt-3 ${height}`}>
        <div className="absolute inset-y-0 left-0 right-12">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            {bands.map((b) => {
              const top = scaleY(b.to, HEIGHT, domain);
              return <rect key={`${b.from}-${b.to}`} x={0} width={WIDTH} y={top} height={scaleY(b.from, HEIGHT, domain) - top} fill="var(--accent)" opacity={0.07} />;
            })}
            {shade && <rect x={x(shade.from)} width={Math.max(2, x(shade.to) - x(shade.from))} y={0} height={HEIGHT} fill="var(--loss)" opacity={0.1} />}
            {ticks.map((t) => {
              const y = scaleY(t, HEIGHT, domain);
              return <line key={t} x1={0} x2={WIDTH} y1={y} y2={y} stroke="var(--border)" vectorEffect="non-scaling-stroke" />;
            })}
            {paths.map((d, i) => (
              <path
                key={series[i].label}
                d={d}
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
          {shade?.label && (
            <span className="absolute top-1 ml-1 rounded bg-surface/85 px-1 text-xs font-medium text-loss" style={{ left: pct(x(shade.from), WIDTH) }}>
              {shade.label}
            </span>
          )}
          {markers.map((m) => (
            <div key={`${m.index}-${m.label}`} className="absolute inset-y-0" style={{ left: pct(x(m.index), WIDTH) }}>
              <div className="h-full border-l border-dashed border-foreground/30" />
              <span className="absolute bottom-0 ml-1 rounded bg-surface/85 px-1 text-xs whitespace-nowrap text-muted">{m.label}</span>
            </div>
          ))}
        </div>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2 text-xs text-muted tabular-nums" style={{ top: pct(scaleY(t, HEIGHT, domain), HEIGHT) }}>
            {format(t)}
          </span>
        ))}
        {bands
          .filter((b) => b.label)
          .map((b) => (
            <span key={b.label} className="absolute left-1 -translate-y-full text-xs text-accent" style={{ top: pct(scaleY(b.to, HEIGHT, domain), HEIGHT) }}>
              {b.label}
            </span>
          ))}
      </div>
    </figure>
  );
}

/** Percent with a sign and one decimal: "+12.3%", "−4.0%". */
export const signedPercent = (fraction: number) => `${fraction >= 0 ? "+" : "−"}${Math.abs(fraction * 100).toFixed(1)}%`;
export const plainPercent = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`;
export const dollars = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 });
