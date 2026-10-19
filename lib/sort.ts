/**
 * Sorting for the stocks table. Kept separate from the component, as a pure
 * function, so it's easy to test and reuse.
 */
import type { Stock } from "./types";

export const SORT_KEYS = ["symbol", "price", "changePercent", "marketCap", "peRatio"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

export interface Sort {
  key: SortKey;
  direction: SortDirection;
}

/**
 * The direction a column starts in when it's first selected: A→Z for text,
 * biggest first for numbers, which is what people usually look for.
 */
export function defaultDirection(key: SortKey): SortDirection {
  return key === "symbol" ? "asc" : "desc";
}

/** Clicking the sorted column flips it; clicking another column starts it in its default direction. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: defaultDirection(key) };
}

/**
 * Returns a sorted copy (the input isn't changed). Works on anything that has
 * the sortable fields, so it accepts full stocks or slimmer table rows. Ties
 * are broken by symbol, A→Z, so the order is always the same.
 */
export function sortStocks<T extends Pick<Stock, SortKey>>(stocks: readonly T[], { key, direction }: Sort): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...stocks].sort((a, b) => {
    const order = key === "symbol" ? a.symbol.localeCompare(b.symbol) : a[key] - b[key];
    return order !== 0 ? order * sign : a.symbol.localeCompare(b.symbol);
  });
}
