/**
 * A grey placeholder block that pulses while content loads. Give it a size
 * with className. Hidden from screen readers: whatever contains it should
 * say "Loading…" once (with aria-busy and visually hidden text).
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-foreground/[0.06] ${className}`} />;
}
