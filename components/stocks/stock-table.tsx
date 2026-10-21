"use client";

import Link from "next/link";
import { useState } from "react";
import { TrendChange, TrendLine } from "@/components/charts/trend-line";
import { useTrendRange } from "@/components/charts/trend-range";
import { trendChange } from "@/lib/chart";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { nextSort, sortStocks, type Sort, type SortKey } from "@/lib/sort";
import type { StockTableRow } from "./stock-table-rows";
import { WatchToggle } from "./watch-toggle";
import { StockLogo } from "@/components/stocks/stock-logo";

interface Column {
  key: SortKey;
  label: string;
  /** Numbers line up on the right, so their digits stack. */
  numeric: boolean;
  /** Tailwind classes that hide less important columns on small screens. */
  visibility?: string;
}

const COLUMNS: Column[] = [
  { key: "symbol", label: "Symbol", numeric: false },
  { key: "price", label: "Price", numeric: true },
  { key: "changePercent", label: "Change", numeric: true },
  { key: "marketCap", label: "Mkt cap", numeric: true, visibility: "hidden md:table-cell" },
  { key: "peRatio", label: "P/E", numeric: true, visibility: "hidden lg:table-cell" },
];

// The symbol column comes first, then the sparkline, then the number columns.

const DIRECTION_LABEL = { asc: "ascending", desc: "descending" } as const;

/**
 * Every stock in a sortable table. Sorting happens here, in the browser, with
 * useState. Keeping it in the URL (?sort=price) would make the page depend on
 * request-time data, so it could no longer be fully pre-rendered.
 */
export function StockTable({ rows, label = "All stocks" }: { rows: StockTableRow[]; label?: string }) {
  const [sort, setSort] = useState<Sort>({ key: "marketCap", direction: "desc" });
  const { range } = useTrendRange();
  // The change column follows the chosen range, and so does sorting by it.
  const ranged = rows.map((row) => ({ ...row, changePercent: trendChange(row.trend, range).percent }));
  const sorted = sortStocks(ranged, sort);
  const columns = COLUMNS.map((c) => (c.key === "changePercent" ? { ...c, label: `${range} change` } : c));
  const sortedLabel = columns.find((c) => c.key === sort.key)?.label;
  const onSort = (key: SortKey) => setSort(nextSort(sort, key));

  return (
    <table className="w-full text-sm">
      {/* Read out by screen readers, so the current order is announced with the table. */}
      <caption className="sr-only">
        {label}, sorted by {sortedLabel}, {DIRECTION_LABEL[sort.direction]}
      </caption>
      <thead>
        <tr className="border-b border-border text-xs text-muted">
          <SortableHeader column={columns[0]} sort={sort} onSort={onSort} />
          <th scope="col" className="hidden py-2 pr-4 text-left font-medium sm:table-cell">
            {range} trend
          </th>
          {columns.slice(1).map((column) => (
            <SortableHeader key={column.key} column={column} sort={sort} onSort={onSort} />
          ))}
          <th scope="col" className="w-10 py-2 pl-2">
            <span className="sr-only">Watchlist</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {sorted.map((stock) => (
          // `relative` lets the link's ::after cover the whole row (see below).
          <tr key={stock.symbol} className="relative transition-colors hover:bg-foreground/[0.04] has-focus-visible:bg-foreground/[0.04]">
            {/*
             * On phones, max-w-0 lets this column shrink to whatever room the
             * price and change columns leave, and the name truncates to fit.
             * Without it, the full name would set a minimum width and the
             * table would overflow the card.
             */}
            <td className="max-w-0 py-3 pr-4 sm:max-w-none">
              <div className="flex items-center gap-3">
                <StockLogo symbol={stock.symbol} size={36} hideOnPhone />
                <div className="min-w-0">
                  {/*
                   * A <tr> can't be a link, so the link sits in the first cell and
                   * its ::after stretches over the whole row: clicking anywhere on
                   * the row follows it, and there's still one link per row for
                   * keyboard and screen reader users.
                   */}
                  <Link
                    href={`/stocks/${stock.symbol}`}
                    className="block font-semibold outline-none after:absolute after:inset-y-0 after:-inset-x-2 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-accent"
                  >
                    {stock.symbol}
                  </Link>
                  <span className="block truncate text-xs text-muted">{stock.name}</span>
                </div>
              </div>
            </td>
            <td className="hidden py-3 pr-4 sm:table-cell">
              <TrendLine series={stock.trend} className="h-10 w-20" />
            </td>
            <td className="py-3 pl-4 text-right font-medium tabular-nums">{formatCurrency(stock.price)}</td>
            <td className="py-3 pl-4 text-right">
              <TrendChange series={stock.trend} variant="pill" />
            </td>
            <td className="hidden py-3 pl-4 text-right tabular-nums md:table-cell">{stock.marketCap === null ? "—" : formatCompactCurrency(stock.marketCap)}</td>
            <td className="hidden py-3 pl-4 text-right tabular-nums lg:table-cell">{stock.peRatio === null ? "—" : stock.peRatio.toFixed(1)}</td>
            <td className="py-3 pl-2 text-right">
              <WatchToggle symbol={stock.symbol} variant="icon" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SortableHeader({ column, sort, onSort }: { column: Column; sort: Sort; onSort: (key: SortKey) => void }) {
  const active = sort.key === column.key;
  return (
    <th
      scope="col"
      // aria-sort goes only on the sorted column; the others leave it out.
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
      className={`py-2 font-medium ${column.numeric ? "pl-4 text-right" : "pr-4 text-left"} ${column.visibility ?? ""}`}
    >
      {/* A real button, so the header works with the keyboard (Tab, then Enter or Space). */}
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={`tap -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent ${
          active ? "text-foreground" : ""
        } ${column.numeric ? "flex-row-reverse" : ""}`}
      >
        {column.label}
        {/* The arrow is decoration: aria-sort already tells screen readers the direction. */}
        <span aria-hidden className={`text-[0.7em] ${active ? "" : "opacity-0"}`}>
          {active && sort.direction === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}
