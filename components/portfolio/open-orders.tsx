"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { describeOrder, isOpen } from "@/lib/orders";

/**
 * Limit and stop orders still waiting, with Cancel, and the ones that ended
 * recently without filling (expired, or cancelled, with the reason). Filled
 * ones show up as trades in the activity list. `symbol` narrows it to one
 * stock, for its page. Renders nothing when there's nothing to show.
 */
export function OpenOrders({ symbol }: { symbol?: string }) {
  const { account, cancelOrder } = useAccount();
  const [message, setMessage] = useState<string | null>(null);
  const orders = (account?.orders ?? []).filter((o) => !symbol || o.symbol === symbol);
  const open = orders.filter(isOpen);
  const ended = orders.filter((o) => o.status === "cancelled" || o.status === "expired").slice(0, 5);
  if (!account || (open.length === 0 && ended.length === 0)) return null;

  return (
    <Card aria-labelledby="orders">
      <h2 id="orders" className="text-lg font-semibold tracking-tight">
        {symbol ? `Your ${symbol} orders` : "Orders"}
      </h2>
      <p className="mt-1 text-xs text-muted">Checked once a day, at the close.</p>
      {open.length > 0 ? (
        <ul className="mt-3 divide-y divide-border text-sm">
          {open.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                {symbol ? describeOrder(o, formatCurrency) : (
                  <>
                    <Link href={`/stocks/${o.symbol}`} className="font-semibold hover:text-accent">
                      {o.symbol}
                    </Link>
                    : {describeOrder(o, formatCurrency)}
                  </>
                )}
                <span className="block text-xs text-muted">
                  {o.type === "limit" ? "Limit" : "Stop"} · {o.duration === "day" ? "next close only" : "until cancelled"} · placed {formatDate(o.createdAt)}
                </span>
              </span>
              <button
                type="button"
                onClick={async () => {
                  const result = await cancelOrder(o.id);
                  setMessage(result.ok ? "Order cancelled." : result.message);
                }}
                className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No open orders.</p>
      )}
      {ended.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-accent">Recently ended without filling</summary>
          <ul className="mt-2 space-y-1.5 text-xs text-muted">
            {ended.map((o) => (
              <li key={o.id}>
                {o.symbol}: {describeOrder(o, formatCurrency)}. {o.status === "expired" ? "Expired" : "Cancelled"} {o.closedAt ? formatDate(o.closedAt) : ""}.{" "}
                {o.status === "cancelled" && o.note}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p role="status" className="mt-2 min-h-4 text-xs text-muted">
        {message}
      </p>
    </Card>
  );
}
