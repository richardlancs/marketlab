import { formatCurrency } from "@/lib/format";

interface RangeBarProps {
  low: number;
  high: number;
  current: number;
}

/**
 * Where today's price sits between a low and a high, e.g. the 52-week range.
 * A track with a marker, plus the two ends labeled underneath. The sentence
 * at the bottom says the same thing in words for screen readers.
 */
export function RangeBar({ low, high, current }: RangeBarProps) {
  // 0 = at the low, 1 = at the high. A flat range puts the marker in the middle.
  const position = high === low ? 0.5 : Math.min(1, Math.max(0, (current - low) / (high - low)));
  const percent = `${position * 100}%`;

  return (
    <div>
      <div aria-hidden className="relative h-1.5 rounded-full bg-foreground/10">
        {/* The filled part runs from the low up to today's price. */}
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent/60" style={{ width: percent }} />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
          style={{ left: percent }}
        />
      </div>

      <div className="mt-2 flex justify-between text-xs tabular-nums">
        <span>
          <span className="block text-muted">Low</span>
          {formatCurrency(low)}
        </span>
        <span className="text-right">
          <span className="block text-muted">High</span>
          {formatCurrency(high)}
        </span>
      </div>

      <p className="mt-3 text-sm text-muted">
        Today&apos;s price is <span className="font-medium text-foreground">{Math.round(position * 100)}%</span> of the way from the low to the high.
      </p>
    </div>
  );
}
