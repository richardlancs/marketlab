import { formatChange, formatPercent, formatSignedCurrency } from "@/lib/format";

interface ChangeBadgeProps {
  change: number;
  /** A fraction: 0.0123 means +1.23%. */
  percent: number;
  /**
   * - "inline": "▲ +12.34 (+0.18%)" as colored text, for headlines.
   * - "pill": just "+0.18%" on a tinted background, for compact list rows.
   */
  variant?: "inline" | "pill";
  /** Show the change in dollars ("+$12.34") instead of points ("+12.34"). */
  currency?: boolean;
  className?: string;
}

/**
 * A gain or loss, colored green or red. The +/− sign is part of the text, so
 * the direction is clear without relying on color alone.
 */
export function ChangeBadge({ change, percent, variant = "inline", currency = false, className = "" }: ChangeBadgeProps) {
  // Color by what's displayed: a move that rounds to "0.00%" is shown neutral,
  // not red or green.
  const direction = Math.abs(percent) < 0.00005 ? 0 : Math.sign(change);
  const tone = direction > 0 ? "text-gain" : direction < 0 ? "text-loss" : "text-muted";

  if (variant === "pill") {
    const background = direction > 0 ? "bg-gain/12" : direction < 0 ? "bg-loss/12" : "bg-foreground/5";
    return (
      <span
        className={`inline-block min-w-[4.75rem] rounded-md px-2 py-0.5 text-right text-xs font-semibold tabular-nums ${tone} ${background} ${className}`}
      >
        {formatPercent(percent)}
      </span>
    );
  }

  const arrow = direction > 0 ? "▲" : direction < 0 ? "▼" : "";
  return (
    <span className={`inline-flex items-center gap-1 font-medium tabular-nums ${tone} ${className}`}>
      {arrow && (
        <span aria-hidden className="text-[0.7em]">
          {arrow}
        </span>
      )}
      {currency ? formatSignedCurrency(change) : formatChange(change)} ({formatPercent(percent)})
    </span>
  );
}
