"use client";

import { useAccount } from "@/components/account/account-provider";
import { CorrelationMap } from "@/components/analytics/correlation-map";
import { Card } from "@/components/ui/card";
import { ServiceError, useServiceData } from "@/components/ui/service-data";
import type { WatchlistCorrelation as Answer } from "@/lib/analytics/portfolio";
import { formatDate } from "@/lib/format";

/**
 * How the watched stocks moved together over the last year, from the
 * analytics service (app/api/watchlist/correlation). Loaded again whenever
 * the watchlist changes.
 */
export function WatchlistCorrelation() {
  const { account } = useAccount();
  const watched = account ? [...account.watchlist].sort().join(",") : null;
  const state = useServiceData<Answer>(watched !== null ? { url: `/api/watchlist/correlation?w=${encodeURIComponent(watched)}` } : null);

  return (
    <Card aria-labelledby="watchlist-correlation">
      <h2 id="watchlist-correlation" className="text-lg font-semibold tracking-tight">
        How they move together
      </h2>
      <p className="mt-1 text-sm text-muted">Correlation of the watched stocks&apos; daily returns over the last year, with similar stocks side by side.</p>
      {state.status === "loading" && <div aria-busy className="mt-4 h-48 animate-pulse rounded-lg bg-foreground/[0.06]" />}
      {state.status === "error" && <ServiceError message={state.message} onRetry={state.retry} />}
      {state.status === "ok" &&
        ("empty" in state.data ? (
          <p className="mt-3 text-sm text-muted">Watch two or more stocks to see how they move together.</p>
        ) : (
          <>
            <CorrelationMap symbols={state.data.symbols} summary={state.data.summary} noun="stocks" />
            <p className="mt-3 text-xs text-muted">
              As of the {formatDate(state.data.asOf)} close
              {state.data.leftOut.length > 0 && ` (without ${state.data.leftOut.join(", ")}: not enough price history)`}. Based on past prices; how stocks move together changes over time.
            </p>
          </>
        ))}
    </Card>
  );
}
