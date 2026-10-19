"use client";

import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { sectorAllocation } from "@/lib/allocation";
import { formatCurrency, formatShare } from "@/lib/format";
import { summarizePortfolio } from "@/lib/portfolio";

const GRAY = "color-mix(in srgb, var(--muted) 45%, transparent)";
const colorFor = (index: number | null) => (index === null ? GRAY : `var(--series-${index + 1})`);

/**
 * The portfolio by sector: a 100% bar (lengths compare more accurately than
 * the angles of a pie) and a table with every number. Sectors come from the
 * catalog; tickers outside it count as "Unknown sector".
 */
export function SectorCard() {
  const { account, quotes, listings } = useAccount();
  if (!account) {
    return (
      <Card aria-labelledby="sectors" aria-busy>
        <h2 id="sectors" className="text-lg font-semibold tracking-tight">
          By sector
        </h2>
        <span className="sr-only">Loading…</span>
        <Skeleton className="mt-3 h-40" />
      </Card>
    );
  }

  const sectors = new Map(listings.map((l) => [l.symbol, l.sector]));
  const segments = sectorAllocation(summarizePortfolio(account.holdings, Object.values(quotes), account.cash), (s) => sectors.get(s));

  return (
    <Card aria-labelledby="sectors" className="h-full">
      <h2 id="sectors" className="text-lg font-semibold tracking-tight">
        By sector
      </h2>
      {/* Hidden from screen readers: the table below has every number. 2px gaps keep neighboring colors apart. */}
      <div aria-hidden className="mt-4 flex h-3 gap-0.5">
        {segments
          .filter((s) => s.share > 0)
          .map((s) => (
            <div key={s.key} title={`${s.label}: ${formatShare(s.share)}`} className="rounded-[4px]" style={{ width: `${s.share * 100}%`, background: colorFor(s.color) }} />
          ))}
      </div>
      <table className="mt-4 w-full text-sm tabular-nums">
        <caption className="sr-only">Portfolio value by sector</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className="pb-1.5 text-left font-medium">
              Sector
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Value
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Share
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border border-t border-border">
          {segments.map((s) => (
            <tr key={s.key}>
              <th scope="row" className="py-2 text-left font-normal">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: colorFor(s.color) }} />
                  {s.label}
                </span>
              </th>
              <td className="py-2 text-right">{formatCurrency(s.value)}</td>
              <td className="py-2 text-right text-muted">{formatShare(s.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
