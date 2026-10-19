/**
 * Reads a /api/history request. Pure, so the rules are unit-tested.
 *
 * - `symbol=` (repeated): the stocks. Backtests ask for up to 5; the
 *   portfolio chart asks for every stock the account holds or has traded.
 * - `indices=all`: include all three indices, not just the S&P 500, so the
 *   portfolio can be compared with any of them. Then no stock is required
 *   (a cash-only account still has a benchmark).
 * - `from=<timestamp>`: drop older prices, so a 1-year chart doesn't
 *   download 5 years.
 * - `raw=1`: closes as traded instead of adjusted (the portfolio's real
 *   share counts are valued at real prices, and orders fill at them).
 * - `actions=1`: include each stock's dividends and splits.
 */
import { MAX_HOLDINGS, MAX_OPEN_ORDERS, MAX_WATCHLIST } from "../trading";
import { isSymbolFormat, normalizeSymbol } from "./symbols";

/** Enough for an account: its holdings, watchlist or busy trade history, and its open orders. */
export const MAX_HISTORY_SYMBOLS = MAX_HOLDINGS + MAX_WATCHLIST + MAX_OPEN_ORDERS;

export interface HistoryQuery {
  symbols: string[];
  allIndices: boolean;
  from: number | null;
  raw: boolean;
  actions: boolean;
}

export function parseHistoryQuery(params: URLSearchParams): HistoryQuery | null {
  const symbols = [...new Set(params.getAll("symbol").map(normalizeSymbol))];
  const allIndices = params.get("indices") === "all";
  const fromText = params.get("from");
  const from = fromText === null ? null : Number(fromText);
  if (from !== null && !(Number.isInteger(from) && from >= 0)) return null;
  if (symbols.length > MAX_HISTORY_SYMBOLS || !symbols.every(isSymbolFormat)) return null;
  if (symbols.length === 0 && !allIndices) return null;
  return { symbols, allIndices, from, raw: params.get("raw") === "1", actions: params.get("actions") === "1" };
}
