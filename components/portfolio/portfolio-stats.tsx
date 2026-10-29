"use client";

import { useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { ChangeBadge } from "@/components/ui/change-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import { summarizePortfolio } from "@/lib/portfolio";
import { STARTING_PRESETS, type StartingPreset } from "@/lib/starting-account";
import { totalRealizedGain } from "@/lib/trading";

/** Where the money is (cash vs invested), gains so far, and the reset button. */
export function PortfolioStats() {
  const { account, book, quotes, reset } = useAccount();
  const [confirming, setConfirming] = useState(false);
  const [preset, setPreset] = useState<StartingPreset>("starter");

  if (!account) {
    return (
      <Card aria-labelledby="stats" aria-busy>
        <h2 id="stats" className="text-lg font-semibold tracking-tight">
          Summary
        </h2>
        <span className="sr-only">Loading…</span>
        <Skeleton className="mt-3 h-48" />
      </Card>
    );
  }

  const portfolio = summarizePortfolio(account.holdings, Object.values(quotes), account.cash, account.options);
  const invested = portfolio.totalValue - portfolio.cash;
  const realized = totalRealizedGain(account);
  const rows = [
    { label: "Cash", value: formatCurrency(portfolio.cash) },
    { label: "Invested", value: formatCurrency(invested) },
    { label: "Cost basis", value: formatCurrency(portfolio.costBasis) },
    { label: "Trades", value: String(account.trades.length) },
  ];

  return (
    <Card aria-labelledby="stats">
      <h2 id="stats" className="text-lg font-semibold tracking-tight">
        Summary
      </h2>
      <dl className="mt-3 space-y-2 text-sm tabular-nums">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between">
            <dt className="text-muted">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-border pt-2">
          {/* Unrealized: on paper, in shares you still hold. Realized: locked in by selling. */}
          <dt className="text-muted">Unrealized gain</dt>
          <dd>
            <ChangeBadge change={portfolio.totalGain} percent={portfolio.totalGainPercent} currency />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Realized gain</dt>
          <dd className={`font-medium ${realized > 0 ? "text-gain" : realized < 0 ? "text-loss" : ""}`}>{formatSignedCurrency(realized)}</dd>
        </div>
      </dl>

      {/* A season portfolio can't start over: everyone keeps the same $100,000 start. */}
      {!book.seasonId && (
      <div className="mt-5 border-t border-border pt-4">
        {confirming ? (
          // An inline "are you sure?" instead of a pop-up. role="alert" announces it.
          <div role="alert" className="text-sm">
            <p>Start over? Your trades, orders, alerts and watchlist changes will be lost.</p>
            <fieldset className="mt-3 space-y-1.5">
              <legend className="mb-1 text-xs text-muted">Start with</legend>
              {(Object.keys(STARTING_PRESETS) as StartingPreset[]).map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="preset" value={key} checked={preset === key} onChange={() => setPreset(key)} className="accent-accent" />
                  {STARTING_PRESETS[key]}
                </label>
              ))}
            </fieldset>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={async () => {
                  await reset(preset);
                  setConfirming(false);
                }}
                className="rounded-full bg-loss-fill px-4 py-1.5 font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-full px-4 py-1.5 font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="tap text-sm text-muted transition-colors hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
          >
            Start over…
          </button>
        )}
      </div>
      )}
    </Card>
  );
}
