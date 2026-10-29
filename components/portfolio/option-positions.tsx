"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { ChangeBadge } from "@/components/ui/change-badge";
import { Explain } from "@/components/ui/explain";
import { formatCurrency, formatDate } from "@/lib/format";
import type { OptionPosition } from "@/lib/trading";

const DAY = 86_400_000;

/** "KO 19 Dec 2026 $60 call". */
export const contractName = (o: Pick<OptionPosition, "symbol" | "kind" | "strike" | "expiry">) => `${o.symbol} ${formatDate(o.expiry)} ${formatCurrency(o.strike)} ${o.kind}`;

/** The chain's expiry date (YYYY-MM-DD) for a stored expiry (noon UTC that day). */
const expiryDate = (expiry: number) => new Date(expiry).toISOString().slice(0, 10);

/**
 * Paper option positions: each at its latest value from the analytics
 * service (or what was paid, until it has one), with Close. Written options
 * show negative values: what buying them back would cost. Renders nothing
 * without any.
 */
export function OptionPositions() {
  const { account, book, placeOptionOrder } = useAccount();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const options = account?.options ?? [];
  if (!account || options.length === 0) return null;

  return (
    <Card aria-labelledby="options">
      <h2 id="options" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
        Options <Explain term="callsAndPuts" />
      </h2>
      <p className="mt-1 text-xs text-muted">
        Simulated contracts for 100 shares each, valued at each close and settled in cash at expiry.{" "}
        <Link href="/options" className="text-accent hover:underline">
          Options lab
        </Link>
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Option positions</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="pb-1.5 text-left font-medium">Contract</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Contracts</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Paid / got</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Now</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Value</th>
              <th scope="col" className="pb-1.5 text-right font-medium">Return</th>
              <th scope="col" className="pb-1.5 text-right font-medium">
                <span className="sr-only">Close</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-t border-border">
            {options.map((o) => {
              const now = o.mark ?? o.averagePremium;
              const value = o.contracts * 100 * now;
              const gain = o.contracts * 100 * (now - o.averagePremium);
              const cost = Math.abs(o.contracts) * 100 * o.averagePremium;
              const days = Math.max(0, Math.ceil((o.expiry - (account.processedThrough ?? o.expiry)) / DAY));
              return (
                <tr key={o.id}>
                  <th scope="row" className="py-2 text-left font-medium">
                    <Link href={`/stocks/${o.symbol}`} className="hover:text-accent">
                      {contractName(o)}
                    </Link>
                    <span className="block text-xs font-normal text-muted">
                      {o.contracts < 0 ? (o.kind === "call" ? "Covered call" : "Cash-secured put") : "Owned"} · {days} {days === 1 ? "day" : "days"} left
                      {o.delta !== undefined && ` · delta ${o.delta.toFixed(2)}`}
                      {o.mark === undefined && " · not valued yet"}
                    </span>
                  </th>
                  <td className="py-2 text-right">{o.contracts < 0 ? `${o.contracts} written` : o.contracts}</td>
                  <td className="py-2 text-right">{formatCurrency(o.averagePremium)}</td>
                  <td className="py-2 text-right">{formatCurrency(now)}</td>
                  <td className="py-2 text-right">{formatCurrency(value)}</td>
                  <td className="py-2 text-right">
                    <ChangeBadge change={gain} percent={cost ? gain / cost : 0} variant="pill" />
                  </td>
                  <td className="py-2 pl-2 text-right">
                    {!book.readOnly && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={async () => {
                          setBusy(o.id);
                          const result = await placeOptionOrder({ symbol: o.symbol, kind: o.kind, strike: o.strike, expiry: expiryDate(o.expiry), side: o.contracts > 0 ? "sell" : "buy", contracts: Math.abs(o.contracts) });
                          setBusy(null);
                          setMessage(result.ok ? `Closed ${contractName(o)}.` : result.message);
                        }}
                        className="tap rounded-full px-3 py-1 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                      >
                        {busy === o.id ? "Closing…" : "Close"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p role="status" className="mt-2 min-h-4 text-xs text-muted">
        {message}
      </p>
    </Card>
  );
}
