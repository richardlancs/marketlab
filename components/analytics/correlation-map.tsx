"use client";

import { useState } from "react";
import { Explain } from "@/components/ui/explain";
import type { CorrelationSummary } from "@/lib/analytics/portfolio";

const num = (v: number | null) => (v === null ? "—" : v.toFixed(2));

/**
 * How a set of stocks move together: a heatmap of their daily-return
 * correlations, in an order that keeps similar stocks side by side, the
 * closest pairs, and how many independent bets they amount to
 * (services/analytics/analytics/correlation.py). Used by the portfolio's
 * risk analysis and the watchlist.
 */
export function CorrelationMap({ symbols, summary, noun = "holdings" }: { symbols: string[]; summary: CorrelationSummary; noun?: string }) {
  const [active, setActive] = useState<[number, number] | null>(null);
  if (symbols.length < 2) return <p className="mt-3 text-sm text-muted">Two or more stocks are needed to compare.</p>;
  const order = summary.order.length === symbols.length ? summary.order : symbols.map((_, i) => i);
  const bets = summary.effectiveBets;
  const close = summary.closest.filter((c) => (c.correlation ?? 0) >= 0.7);

  return (
    <div>
      {bets !== null && (
        <p className="mt-2 text-sm">
          Your {symbols.length} {noun} move like about <span className="font-semibold tabular-nums">{bets < 1.95 ? bets.toFixed(1) : Math.round(bets)}</span> independent{" "}
          {Math.round(bets) === 1 && bets < 1.5 ? "bet" : "bets"}
          {bets < symbols.length * 0.5 ? ": much of the spread is the same bet several times." : "."}
          <Explain term="diversification" className="ml-1.5 align-middle" />
        </p>
      )}
      {close.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          Closest: {close.map((c, i) => (
            <span key={`${c.a}-${c.b}`}>
              {i > 0 && ", "}
              <span className="font-medium text-foreground">
                {c.a} and {c.b}
              </span>{" "}
              ({num(c.correlation)})
            </span>
          ))}
          .
        </p>
      )}
      <div className="mt-3 overflow-x-auto" onPointerLeave={() => setActive(null)}>
        <table className="text-xs tabular-nums">
          <caption className="sr-only">Correlation of daily returns between each pair, similar stocks next to each other</caption>
          <thead>
            <tr>
              <td />
              {order.map((j) => (
                <th key={symbols[j]} scope="col" className={`px-1 pb-1 font-medium ${active?.[1] === j ? "text-foreground" : "text-muted"}`}>
                  {symbols[j]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((i) => (
              <tr key={symbols[i]}>
                <th scope="row" className={`pr-2 text-right font-medium ${active?.[0] === i ? "text-foreground" : "text-muted"}`}>
                  {symbols[i]}
                </th>
                {order.map((j) => {
                  const c = summary.correlation[i][j] ?? 0;
                  const strength = Math.round(Math.min(1, Math.abs(c)) * 70);
                  return (
                    <td key={symbols[j]} className="p-0.5" onPointerEnter={() => setActive([i, j])}>
                      <div
                        title={`${symbols[i]} and ${symbols[j]}: ${num(c)}`}
                        className={`grid size-10 place-items-center rounded-md ${active?.[0] === i && active[1] === j ? "ring-2 ring-foreground/40" : ""}`}
                        style={{ background: `color-mix(in oklab, var(${c >= 0 ? "--accent" : "--loss"}) ${strength}%, transparent)`, color: strength > 45 ? "white" : undefined }}
                      >
                        {i === j ? "" : num(c)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 min-h-4 text-xs text-muted">
        {active && active[0] !== active[1]
          ? `${symbols[active[0]]} and ${symbols[active[1]]}: ${num(summary.correlation[active[0]][active[1]])}`
          : "1 moves in lockstep, 0 unrelated, below 0 opposite. Darker means stronger."}
      </p>
    </div>
  );
}
