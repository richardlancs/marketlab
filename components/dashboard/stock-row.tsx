import Link from "next/link";
import { TrendChange, TrendLine } from "@/components/charts/trend-line";
import type { TrendSeries } from "@/lib/chart";
import { ChangeBadge } from "@/components/ui/change-badge";
import { formatCurrency } from "@/lib/format";
import type { Stock } from "@/lib/types";
import { StockLogo } from "@/components/stocks/stock-logo";

/**
 * One line in a stock list: symbol and name on the left, price and today's
 * change on the right, and optionally a small trend line in between. Shared by
 * the watchlist and top movers cards. The whole row links to the stock's page.
 * Usually rendered on the server; the watchlist card also renders it in the
 * browser for stocks outside the core.
 */
export function StockRow({ stock, sparkline = false }: { stock: Pick<Stock, "symbol" | "name" | "price" | "change" | "changePercent"> & { trend?: TrendSeries }; sparkline?: boolean }) {
  return (
    <li>
      {/*
       * -mx-2 px-2: the hover background extends a little past the text on
       * both sides, while the text stays lined up with the card's heading.
       */}
      <Link
        href={`/stocks/${stock.symbol}`}
        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-accent"
      >
        <StockLogo symbol={stock.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{stock.symbol}</p>
          <p className="truncate text-xs text-muted">{stock.name}</p>
        </div>

        {sparkline && stock.trend && <TrendLine series={stock.trend} className="h-10 w-16 shrink-0" />}

        <div className="shrink-0 text-right">
          <p className="text-sm font-medium tabular-nums">{formatCurrency(stock.price)}</p>
          {/* With a trend line, the change follows its range; without one (top movers), it's today's. */}
          {sparkline && stock.trend ? (
            <TrendChange series={stock.trend} variant="pill" className="mt-1" />
          ) : (
            <ChangeBadge change={stock.change} percent={stock.changePercent} variant="pill" className="mt-1" />
          )}
        </div>
      </Link>
    </li>
  );
}
