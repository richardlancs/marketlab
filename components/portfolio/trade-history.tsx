"use client";

import Link from "next/link";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate, formatSignedCurrency, formatTime } from "@/lib/format";

/** Every buy and sell, newest first. */
export function TradeHistory() {
  const { account } = useAccount();

  return (
    <Card aria-labelledby="history" aria-busy={!account} className="overflow-x-auto">
      <h2 id="history" className="text-lg font-semibold tracking-tight">
        Trade history
      </h2>
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
