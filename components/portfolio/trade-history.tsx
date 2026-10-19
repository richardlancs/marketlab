"use client";

import Link from "next/link";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { tradesToCsv } from "@/lib/csv";
import { formatCurrency, formatDate, formatSignedCurrency, formatTime } from "@/lib/format";
import { MAX_TRADES, type AccountEvent, type Trade } from "@/lib/trading";

/**
 * Saves the trades as a .csv file. Runs in a click handler, so reading the
 * clock for the file name is fine (it never happens while rendering). The
 * file is made in the browser from the account it already has, so this works
 * the same signed in or not.
 */
function downloadCsv(trades: readonly Trade[], events: readonly AccountEvent[]) {
  const url = URL.createObjectURL(new Blob([tradesToCsv(trades, events)], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `marketlab-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

type Row = { kind: "trade"; time: number; trade: Trade } | { kind: "event"; time: number; event: AccountEvent };

/** Every buy and sell, dividend and split, newest first. */
export function TradeHistory() {
  const { account } = useAccount();
  const rows: Row[] = account
    ? [...account.trades.map((trade): Row => ({ kind: "trade", time: trade.time, trade })), ...(account.events ?? []).map((event): Row => ({ kind: "event", time: event.time, event }))].sort(
        (a, b) => b.time - a.time,
      )
    : [];

  return (
    <Card aria-labelledby="history" aria-busy={!account} className="overflow-x-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="history" className="text-lg font-semibold tracking-tight">
          Activity
        </h2>
        {account && rows.length > 0 && (
          <span className="flex items-baseline gap-3 text-xs text-muted">
            {account.trades.length >= MAX_TRADES && <span>Your latest {MAX_TRADES} trades are kept.</span>}
            <button
              type="button"
              onClick={() => downloadCsv(account.trades, account.events ?? [])}
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
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No trades yet. Buy or sell from any{" "}
          <Link href="/stocks" className="text-accent hover:underline">
            stock&apos;s page
          </Link>
          .
        </p>
      ) : (
        <table className="mt-3 w-full text-sm tabular-nums">
          <caption className="sr-only">Trades, dividends and splits, newest first</caption>
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
            {rows.map((row) =>
              row.kind === "event" ? (
                <EventRow key={`e-${row.event.id}`} event={row.event} />
              ) : (
              <tr key={row.trade.id}>
                <td className="py-2 pr-4 whitespace-nowrap text-muted">
                  {formatDate(row.trade.time)}
                  <span className="block text-xs">{formatTime(row.trade.time)}</span>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <span className={`font-medium ${row.trade.side === "buy" ? "text-accent" : "text-loss"}`}>{row.trade.side === "buy" ? "Buy" : "Sell"}</span>{" "}
                  {row.trade.shares}{" "}
                  <Link href={`/stocks/${row.trade.symbol}`} className="font-semibold hover:text-accent">
                    {row.trade.symbol}
                  </Link>
                </td>
                <td className="py-2 pl-4 text-right">{formatCurrency(row.trade.price)}</td>
                <td className="py-2 pl-4 text-right">{formatCurrency(row.trade.shares * row.trade.price)}</td>
                <td className="hidden py-2 pl-4 text-right sm:table-cell">
                  {row.trade.realizedGain === undefined ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className={row.trade.realizedGain > 0 ? "text-gain" : row.trade.realizedGain < 0 ? "text-loss" : ""}>
                      {formatSignedCurrency(row.trade.realizedGain)}
                    </span>
                  )}
                </td>
              </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** A dividend ("Dividend 40 AAPL · $0.25 a share") or a split, in the activity table. */
function EventRow({ event }: { event: AccountEvent }) {
  return (
    <tr>
      <td className="py-2 pr-4 whitespace-nowrap text-muted">{formatDate(event.time)}</td>
      <td className="py-2 whitespace-nowrap">
        <span className="font-medium text-gain">{event.kind === "dividend" ? "Dividend" : "Split"}</span>{" "}
        {event.kind === "dividend" ? (
          <>
            {event.shares}{" "}
            <Link href={`/stocks/${event.symbol}`} className="font-semibold hover:text-accent">
              {event.symbol}
            </Link>
          </>
        ) : (
          <>
            <Link href={`/stocks/${event.symbol}`} className="font-semibold hover:text-accent">
              {event.symbol}
            </Link>{" "}
            {event.value}-for-1: {event.shares} → {event.sharesAfter} shares
          </>
        )}
      </td>
      <td className="py-2 pl-4 text-right">{event.kind === "dividend" ? `${formatCurrency(event.value)}/sh` : "—"}</td>
      <td className="py-2 pl-4 text-right">{event.cash > 0 ? `+${formatCurrency(event.cash)}` : "—"}</td>
      <td className="hidden py-2 pl-4 text-right text-muted sm:table-cell">—</td>
    </tr>
  );
}
