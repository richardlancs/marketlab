"use client";

import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { ChangeBadge } from "@/components/ui/change-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { summarizePortfolio } from "@/lib/portfolio";
import type { StockQuote } from "@/lib/types";

/** How much of one stock the simulated portfolio holds (or is short), and how it's doing. */
export function PositionCard({ quote }: { quote: StockQuote }) {
  const { account, quotes } = useAccount();
  const { symbol } = quote;
  // This page's quote is the freshest for this stock; the others value the rest of the portfolio (for the weight).
  const portfolio = account && summarizePortfolio(account.holdings, Object.values({ ...quotes, [symbol]: quote }), account.cash, account.options);
  const position = portfolio?.positions.find((p) => p.symbol === symbol);

  return (
    <Card aria-labelledby="position" aria-busy={!portfolio}>
      <h2 id="position" className="text-lg font-semibold tracking-tight">
        Your position
      </h2>
      {!portfolio ? (
        <>
          <span className="sr-only">Loading your position…</span>
          <Skeleton className="mt-3 h-36" />
        </>
      ) : position ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">{position.shares < 0 ? "Shares short" : "Shares"}</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{Math.abs(position.shares)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{position.shares < 0 ? "Average sale price" : "Average cost"}</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{formatCurrency(position.averageCost)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Market value</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{formatCurrency(position.marketValue)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Weight</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{((position.marketValue / portfolio.totalValue) * 100).toFixed(1)}%</dd>
          </div>
          <div className="col-span-2 border-t border-border pt-3">
            <dt className="text-xs text-muted">Today</dt>
            <dd className="mt-0.5">
              <ChangeBadge
                change={position.dayChange}
                // Today's % is measured against yesterday's value of the position (for a short, what it would cost to buy back).
                percent={position.dayChange / Math.abs(position.marketValue - position.dayChange)}
                currency
              />
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted">Total return</dt>
            <dd className="mt-0.5">
              <ChangeBadge change={position.gain} percent={position.gainPercent} currency />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted">You don&apos;t own any {symbol} in your simulated portfolio.</p>
      )}
    </Card>
  );
}
