import { formatCompactCurrency, formatCompactNumber, formatCurrency } from "@/lib/format";
import type { Stock } from "@/lib/types";

/** Key numbers under a price chart. Shared by the dashboard's featured card and the stock page. */
export function StockStats({ stock, className = "" }: { stock: Stock; className?: string }) {
  const stats = [
    { label: "Open", value: formatCurrency(stock.open) },
    { label: "High", value: formatCurrency(stock.high) },
    { label: "Low", value: formatCurrency(stock.low) },
    { label: "Volume", value: formatCompactNumber(stock.volume) },
    { label: "Mkt cap", value: formatCompactCurrency(stock.marketCap) },
    { label: "P/E", value: stock.peRatio.toFixed(1) },
  ];

  return (
    <dl className={`grid grid-cols-3 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-6 ${className}`}>
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt className="text-xs text-muted">{stat.label}</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
