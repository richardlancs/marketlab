"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { useAccount, type Journal } from "@/components/account/account-provider";
import { JournalFields } from "@/components/account/journal-fields";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { tradesToCsv } from "@/lib/csv";
import { formatCurrency, formatDate, formatSignedCurrency, formatTime } from "@/lib/format";
import { MAX_TRADES, REASON_NAMES, type AccountEvent, type Trade } from "@/lib/trading";

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
  const { account, book, annotateTrade } = useAccount();
  const [editing, setEditing] = useState<{ id: string; journal: Journal; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing || saving) return;
    setSaving(true);
    const note = editing.journal.note?.trim();
    const result = await annotateTrade(editing.id, { ...(editing.journal.reason && { reason: editing.journal.reason }), ...(note && { note }) });
    setSaving(false);
    setEditing(result.ok ? null : { ...editing, error: result.message });
  }
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
              <Fragment key={row.trade.id}>
              <tr>
                <td className="py-2 pr-4 whitespace-nowrap text-muted">
                  {formatDate(row.trade.time)}
                  <span className="block text-xs">{formatTime(row.trade.time)}</span>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <span className={`font-medium ${row.trade.side === "buy" ? "text-accent" : "text-loss"}`}>{tradeVerb(row.trade)}</span>{" "}
                  {row.trade.shares}{" "}
                  <Link href={`/stocks/${row.trade.symbol}`} className="font-semibold hover:text-accent">
                    {row.trade.symbol}
                  </Link>
                  {row.trade.option && ` ${formatCurrency(row.trade.option.strike)} ${row.trade.option.kind}${row.trade.shares === 1 ? "" : "s"}, ${formatDate(row.trade.option.expiry)}`}
                  <span className="block max-w-56 truncate text-xs whitespace-nowrap text-muted sm:max-w-72" title={row.trade.note}>
                    {row.trade.reason && <span className="font-medium text-foreground">{REASON_NAMES[row.trade.reason]}</span>}
                    {row.trade.reason && row.trade.note && " · "}
                    {row.trade.note}
                    {!book.readOnly && editing?.id !== row.trade.id && (
                      <button
                        type="button"
                        onClick={() => setEditing({ id: row.trade.id, journal: { reason: row.trade.reason, note: row.trade.note } })}
                        className={`${row.trade.reason || row.trade.note ? "ml-2" : ""} font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent`}
                      >
                        {row.trade.reason || row.trade.note ? "Edit" : "Add why"}
                        <span className="sr-only"> for this {row.trade.symbol} trade</span>
                      </button>
                    )}
                  </span>
                </td>
                <td className="py-2 pl-4 text-right">{formatCurrency(row.trade.price)}</td>
                <td className="py-2 pl-4 text-right">{formatCurrency(row.trade.shares * row.trade.price * (row.trade.option ? 100 : 1))}</td>
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
              {editing?.id === row.trade.id && (
                <tr>
                  <td colSpan={5} className="pb-4">
                    <div className="max-w-xl rounded-lg border border-border p-3 font-sans">
                      <JournalFields value={editing.journal} onChange={(journal) => setEditing({ ...editing, journal, error: undefined })} />
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" onClick={save} disabled={saving} className="h-9 rounded-full bg-accent-fill px-4 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50">
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="h-9 rounded-full px-4 text-sm font-medium text-muted hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent">
                          Cancel
                        </button>
                        {editing.error && (
                          <p role="alert" className="text-sm text-loss">
                            {editing.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
              ),
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/**
 * What a trade did. A trade doesn't record whether it opened a short, but the
 * account's rules tell: a sale of shares owned always has a realised gain,
 * so a sale without one opened a short; and a buy with one covered a short.
 */
function tradeVerb(t: Trade): string {
  if (t.option) return t.side === "buy" ? (t.realizedGain !== undefined ? "Buy back" : "Buy") : t.realizedGain !== undefined ? "Sell" : "Write";
  if (t.side === "buy") return t.realizedGain !== undefined ? "Buy to cover" : "Buy";
  return t.realizedGain !== undefined ? "Sell" : "Sell short";
}

const EVENT_NAMES: Record<AccountEvent["kind"], string> = { dividend: "Dividend", split: "Split", "borrow-fee": "Borrow fee", "margin-call": "Margin call", expiry: "Expiry" };

/** A dividend ("Dividend 40 AAPL · $0.25 a share"), a split, a short's borrow fee, a margin call or an option expiring, in the activity table. */
function EventRow({ event }: { event: AccountEvent }) {
  if (event.kind === "borrow-fee" || event.kind === "margin-call" || event.kind === "expiry") {
    const text =
      event.kind === "borrow-fee"
        ? `${-event.shares} short this month, at ${(event.value * 100).toFixed(0)}% a year`
        : event.kind === "margin-call"
          ? `${event.shares} bought back at ${formatCurrency(event.value)}: equity fell below 30% of your shorts`
          : `${Math.abs(event.shares)} ${event.shares < 0 ? "written" : ""} ${Math.abs(event.shares) === 1 ? "contract" : "contracts"} settled at ${formatCurrency(event.value)} a share`;
    return (
      <tr>
        <td className="py-2 pr-4 whitespace-nowrap text-muted">{formatDate(event.time)}</td>
        <td className="py-2">
          <span className={`font-medium ${event.kind === "margin-call" ? "text-loss" : "text-muted"}`}>{EVENT_NAMES[event.kind]}</span>{" "}
          <Link href={`/stocks/${event.symbol}`} className="font-semibold hover:text-accent">
            {event.symbol}
          </Link>
          <span className="block text-xs text-muted">{text}</span>
        </td>
        <td className="py-2 pl-4 text-right">—</td>
        <td className="py-2 pl-4 text-right">{event.cash < 0 ? formatSignedCurrency(event.cash) : "—"}</td>
        <td className="hidden py-2 pl-4 text-right text-muted sm:table-cell">—</td>
      </tr>
    );
  }
  return (
    <tr>
      <td className="py-2 pr-4 whitespace-nowrap text-muted">{formatDate(event.time)}</td>
      <td className="py-2 whitespace-nowrap">
        <span className={`font-medium ${event.cash < 0 ? "text-loss" : "text-gain"}`}>{EVENT_NAMES[event.kind]}</span>{" "}
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
      <td className="py-2 pl-4 text-right">{event.cash !== 0 ? formatSignedCurrency(event.cash) : "—"}</td>
      <td className="hidden py-2 pl-4 text-right text-muted sm:table-cell">—</td>
    </tr>
  );
}
