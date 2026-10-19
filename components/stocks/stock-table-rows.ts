import type { Stock } from "@/lib/types";

/**
 * Just what the stocks table shows. Server pages build these from full
 * stocks, so a year of price history per stock isn't sent to the browser.
 *
 * This lives apart from stock-table.tsx because that file is a Client
 * Component module, and server code can't call functions exported from one.
 */
export type StockTableRow = Pick<Stock, "symbol" | "name" | "price" | "change" | "changePercent" | "previousClose" | "marketCap" | "peRatio"> & {
  /** Today's prices, for the sparkline. */
  intraday: number[];
};

export function toStockTableRow(stock: Stock): StockTableRow {
  return {
    symbol: stock.symbol,
    name: stock.name,
    price: stock.price,
    change: stock.change,
    changePercent: stock.changePercent,
    previousClose: stock.previousClose,
    marketCap: stock.marketCap,
    peRatio: stock.peRatio,
    intraday: stock.history["1D"].map((p) => p.price),
  };
}
