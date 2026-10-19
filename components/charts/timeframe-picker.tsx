import { TIMEFRAMES, type Timeframe } from "@/lib/types";

/**
 * A segmented control, like the ones in Apple's apps. A single highlight pill
 * slides between the options with a CSS transform.
 */
export function TimeframePicker({ value, onChange }: { value: Timeframe; onChange: (next: Timeframe) => void }) {
  const selected = TIMEFRAMES.indexOf(value);

  return (
    <div role="group" aria-label="Timeframe" className="relative grid grid-cols-4 rounded-full bg-foreground/5 p-0.5 text-xs font-semibold">
      <span
        aria-hidden
        // Exactly one column wide; translateX(100%) moves it by its own width, i.e. one option.
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-0.25rem)/4)] rounded-full bg-surface shadow-sm transition-transform duration-300 ease-out dark:bg-white/15"
        style={{ transform: `translateX(${selected * 100}%)` }}
      />
      {TIMEFRAMES.map((timeframe) => (
        <button
          key={timeframe}
          type="button"
          aria-pressed={timeframe === value}
          onClick={() => onChange(timeframe)}
          className="relative rounded-full px-3.5 py-1.5 text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent aria-pressed:text-foreground"
        >
          {timeframe}
        </button>
      ))}
    </div>
  );
}
