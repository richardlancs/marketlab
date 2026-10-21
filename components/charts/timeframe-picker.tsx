import { TIMEFRAMES, type Timeframe } from "@/lib/types";

/**
 * A segmented control, like the ones in Apple's apps. A single highlight pill
 * slides between the options with a CSS transform.
 */
export function TimeframePicker({ value, onChange, label = "Timeframe" }: { value: Timeframe; onChange: (next: Timeframe) => void; label?: string }) {
  const selected = TIMEFRAMES.indexOf(value);
  const count = TIMEFRAMES.length;

  return (
    <div role="group" aria-label={label} className="relative grid rounded-full bg-foreground/5 p-0.5 text-xs font-semibold" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        // Exactly one column wide; translateX(100%) moves it by its own width, i.e. one option.
        className="absolute inset-y-0.5 left-0.5 rounded-full bg-surface shadow-sm transition-transform duration-300 ease-out dark:bg-white/15"
        style={{ width: `calc((100% - 0.25rem) / ${count})`, transform: `translateX(${selected * 100}%)` }}
      />
      {TIMEFRAMES.map((timeframe) => (
        <button
          key={timeframe}
          type="button"
          aria-pressed={timeframe === value}
          onClick={() => onChange(timeframe)}
          className="tap rounded-full px-2.5 py-1.5 text-muted sm:px-3 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent aria-pressed:text-foreground"
        >
          {timeframe}
        </button>
      ))}
    </div>
  );
}
