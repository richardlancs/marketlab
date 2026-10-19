"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StockRow } from "./stock-row";

/** The most rows the dashboard card shows; the rest are on the watchlist page. */
const MAX_ROWS = 6;

/**
 * Picks the watched stocks' rows and shows them in watchlist order. Core
 * stocks' rows are rendered on the server, by symbol; any other stock's row is
 * rendered here once its prices have loaded.
 */
export function WatchlistCard({ rows }: { rows: Record<string, ReactNode> }) {
  const { account, extraRows } = useAccount();
  const watchlist = account?.watchlist ?? [];
  const rowFor = (symbol: string) => rows[symbol] ?? (extraRows[symbol] && <StockRow key={symbol} stock={extraRows[symbol]} sparkline />);

  return (
    <Card aria-labelledby="watchlist" aria-busy={!account} className="h-full">
      <div className="flex items-baseline justify-between">
        <h2 id="watchlist" className="text-lg font-semibold tracking-tight">
          Watchlist
        </h2>
        {account && watchlist.length > 0 && (
          <Link href="/watchlist" className="text-xs text-accent hover:underline">
            {watchlist.length > MAX_ROWS ? `See all ${watchlist.length}` : "See all"}
          </Link>
        )}
      </div>

      {!account ? (
        <div className="mt-2">
          <span className="sr-only">Loading watchlist…</span>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="my-3 h-11" />
          ))}
        </div>
      ) : watchlist.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nothing here yet. Open a stock and star it to follow it here.{" "}
          <Link href="/stocks" className="text-accent hover:underline">
            Browse stocks
          </Link>
        </p>
      ) : (
        // divide-y draws a hairline between rows, but not above the first one.
        <ul className="mt-2 divide-y divide-border">{watchlist.slice(0, MAX_ROWS).map(rowFor)}</ul>
      )}
    </Card>
  );
}
