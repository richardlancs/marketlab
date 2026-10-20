import { TrendChange, TrendLine, TrendRangePicker } from "@/components/charts/trend-line";
import { Card } from "@/components/ui/card";
import { trendSeries } from "@/lib/chart";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { getMarket } from "@/lib/market";
import type { MarketIndex } from "@/lib/types";

/**
 * The strip of major indices at the top of the dashboard. An async Server
 * Component: it awaits the data on the server and sends finished HTML.
 */
export async function MarketOverview() {
  const { indices, asOf, source } = await getMarket();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="market-overview" className="text-lg font-semibold tracking-tight">
          Markets
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <p className="text-xs text-muted">As of the {formatDate(asOf)} close</p>
          <TrendRangePicker />
        </div>
      </div>

      <ul aria-labelledby="market-overview" className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
        {indices.map((index, i) => (
          <li
            key={index.symbol}
            // Staggered entrance, continuing on from the page heading.
            style={{ animationDelay: `${(i + 1) * 60}ms` }}
            className="animate-fade-up"
          >
            <IndexCard index={index} isFund={source === "tiingo"} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** `isFund`: real data shows a fund that tracks the index (SPY for the S&P 500), priced in dollars. */
function IndexCard({ index, isFund }: { index: MarketIndex; isFund: boolean }) {
  const trend = trendSeries(index);
  return (
    <Card className="group transition-colors hover:border-foreground/15">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-medium">{index.name}</h3>
        <span className="text-xs text-muted">{index.symbol}</span>
      </div>

      <p className="mt-2 text-2xl font-semibold tracking-tight">{isFund ? formatCurrency(index.price) : formatNumber(index.price)}</p>
      {/* The change and the line both follow the chosen range (trend-range.tsx). */}
      <TrendChange series={trend} currency={isFund} className="mt-0.5 text-sm" />

      <TrendLine series={trend} className="mt-4 h-12 w-full" />
    </Card>
  );
}
