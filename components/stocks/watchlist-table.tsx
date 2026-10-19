"use client";

import Link from "next/link";
import { useAccount } from "@/components/account/account-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { StockTable } from "./stock-table";
import type { StockTableRow } from "./stock-table-rows";

/** The stocks table, narrowed to the watchlist. The server sends rows for every stock; this keeps the watched ones. */
export function WatchlistTable({ rows }: { rows: StockTableRow[] }) {
  const { account } = useAccount();

  if (!account) {
    return (
      <div aria-busy className="py-2">
        <span className="sr-only">Loading watchlist…</span>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="my-3 h-11" />
        ))}
      </div>
    );
  }

  const watched = rows.filter((row) => account.watchlist.includes(row.symbol));
  if (watched.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="font-medium">Your watchlist is empty</p>
        <p className="mt-1 text-sm text-muted">Star a stock on its page or in the stocks table to follow it here.</p>
        <Link
          href="/stocks"
          className="mt-5 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Browse stocks
        </Link>
      </div>
    );
  }
  return <StockTable rows={watched} label="Your watchlist" />;
}
