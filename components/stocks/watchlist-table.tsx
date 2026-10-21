"use client";

import Link from "next/link";
import { useAccount } from "@/components/account/account-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { StockTable } from "./stock-table";
import type { StockTableRow } from "./stock-table-rows";

/**
 * The stocks table, narrowed to the watchlist, in watchlist order. The server
 * sends rows for the core stocks; rows for any other watched stock come from
 * the account provider once their prices load.
 */
export function WatchlistTable({ rows }: { rows: StockTableRow[] }) {
  const { account, extraRows } = useAccount();

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

  const bySymbol = Object.fromEntries(rows.map((row) => [row.symbol, row]));
  const watched = account.watchlist.map((symbol) => bySymbol[symbol] ?? extraRows[symbol]).filter((row): row is StockTableRow => row !== undefined);
  if (account.watchlist.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="font-medium">Your watchlist is empty</p>
        <p className="mt-1 text-sm text-muted">Star a stock on its page or in the stocks table to follow it here.</p>
        <Link
          href="/stocks"
          className="mt-5 inline-block rounded-full bg-accent-fill px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Browse stocks
        </Link>
      </div>
    );
  }
  return <StockTable rows={watched} label="Your watchlist" />;
}
