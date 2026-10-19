import { Sparkline } from "@/components/charts/sparkline";
import { ChangeBadge } from "@/components/ui/change-badge";
import { formatCurrency } from "@/lib/format";
import type { Stock } from "@/lib/types";

/**
 * One line in a stock list: symbol and name on the left, price and today's
 * change on the right, and optionally a small trend line in between. Shared by
 * the watchlist and top movers cards.
 */
export function StockRow({ stock, sparkline = false }: { stock: Stock; sparkline?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{stock.symbol}</p>
        <p className="truncate text-xs text-muted">{stock.name}</p>
      </div>

      {sparkline && (
        <Sparkline
          values={stock.history["1D"].map((p) => p.price)}
          baseline={stock.previousClose}
          className={`h-8 w-16 shrink-0 ${stock.change >= 0 ? "text-gain" : "text-loss"}`}
        />
      )}

      <div className="shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums">{formatCurrency(stock.price)}</p>
        <ChangeBadge change={stock.change} percent={stock.changePercent} variant="pill" className="mt-1" />
      </div>
    </li>
  );
}
