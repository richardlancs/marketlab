"use client";

import { useAccount } from "@/components/account/account-provider";

/**
 * Adds a stock to the watchlist or removes it. aria-pressed makes it a toggle
 * button for screen readers ("pressed" / "not pressed"), so the state doesn't
 * depend on seeing the star's color.
 *
 * - "pill": a star plus a word, for the stock page.
 * - "icon": just the star, for table rows.
 */
export function WatchToggle({ symbol, variant = "pill" }: { symbol: string; variant?: "pill" | "icon" }) {
  const { account, toggleWatchlist } = useAccount();
  // Until the account loads, render the button in its "off" look but disabled,
  // so the layout doesn't shift when it appears.
  const watched = account?.watchlist.includes(symbol) ?? false;
  const label = watched ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`;

  return (
    <button
      type="button"
      onClick={() => toggleWatchlist(symbol)}
      disabled={!account}
      aria-pressed={watched}
      aria-label={variant === "icon" ? label : undefined}
      title={label}
      className={
        variant === "pill"
          ? `tap inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 ${
              watched ? "bg-accent/10 text-accent hover:bg-accent/15" : "bg-foreground/5 text-muted hover:text-foreground"
            }`
          : // relative z-10: lifts the button above the row's full-size link overlay, so it gets the click.
            `relative z-10 grid size-8 place-items-center rounded-full transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 ${
              watched ? "text-accent" : "text-muted hover:text-foreground"
            }`
      }
    >
      <svg viewBox="0 0 24 24" aria-hidden className={variant === "pill" ? "size-3.5" : "size-4"} fill={watched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z" />
      </svg>
      {variant === "pill" && (watched ? "On your watchlist" : "Add to watchlist")}
    </button>
  );
}
