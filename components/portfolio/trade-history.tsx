"use client";

import Link from "next/link";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { tradesToCsv } from "@/lib/csv";
import { formatCurrency, formatDate, formatSignedCurrency, formatTime } from "@/lib/format";
import { MAX_TRADES, type Trade } from "@/lib/trading";

/**
 * Saves the trades as a .csv file. Runs in a click handler, so reading the
 * clock for the file name is fine (it never happens while rendering). The
 * file is made in the browser from the account it already has, so this works
 * the same signed in or not.
 */
function downloadCsv(trades: readonly Trade[]) {
  const url = URL.createObjectURL(new Blob([tradesToCsv(trades)], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `marketlab-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Every buy and sell, newest first. */
export function TradeHistory() {
  const { account } = useAccount();

  return (
    <Card aria-labelledby="history" aria-busy={!account} className="overflow-x-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="history" className="text-lg font-semibold tracking-tight">
          Trade history
        </h2>
        {account && account.trades.length > 0 && (
          <span className="flex items-baseline gap-3 text-xs text-muted">
            {account.trades.length >= MAX_TRADES && <span>Your latest {MAX_TRADES} trades are kept.</span>}
            <button
              type="button"
              onClick={() => downloadCsv(account.trades)}
              className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Download CSV
            </button>
          </span>
        )}
      </div>
      {!account ? (
        <>
          <span className="sr-only">Loading…</span>
          <Skeleton className="mt-3 h-32" />
        </>
      ) : account.trades.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No trades yet. Buy or sell from any{" "}
          <Link href="/stocks" className="text-accent hover:underline">
            stock&apos;s page
          </Link>
          .
        </p>
      ) : (
        <table className="mt-3 w-full text-sm tabular-nums">
          <caption className="sr-only">Trades, newest first</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="pb-1.5 text-left font-medium">
                Date
              </th>
              <th scope="col" className="pb-1.5 text-left font-medium">
                Trade
              </th>
              <th scope="col" className="pb-1.5 pl-4 text-right font-medium">
                Price
              </th>
              <th scope="col" className="pb-1.5 pl-4 text-right font-medium">
                Total
              </th>
              <th scope="col" className="hidden pb-1.5 pl-4 text-right font-medium sm:table-cell">
                Realized
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {account.trades.map((trade) => (
              <tr key={trade.id}>
                <td className="py-2 pr-4 whitespace-nowrap text-muted">
                  {formatDate(trade.time)}
                  <span className="block text-xs">{formatTime(trade.time)}</span>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <span className={`font-medium ${trade.side === "buy" ? "text-accent" : "text-loss"}`}>{trade.side === "buy" ? "Buy" : "Sell"}</span>{" "}
                  {trade.shares}{" "}
                  <Link href={`/stocks/${trade.symbol}`} className="font-semibold hover:text-accent">
                    {trade.symbol}
                  </Link>
                </td>
                <td className="py-2 pl-4 text-right">{formatCurrency(trade.price)}</td>
                <td className="py-2 pl-4 text-right">{formatCurrency(trade.shares * trade.price)}</td>
                <td className="hidden py-2 pl-4 text-right sm:table-cell">
                  {trade.realizedGain === undefined ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className={trade.realizedGain > 0 ? "text-gain" : trade.realizedGain < 0 ? "text-loss" : ""}>
                      {formatSignedCurrency(trade.realizedGain)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
