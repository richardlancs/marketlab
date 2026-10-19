/**
 * What a ticker symbol looks like. No imports, so the browser, proxy.ts and
 * server code can all share it.
 *
 * Symbols are stored and shown in one canonical form (upper case, Tiingo's
 * "BRK-B" style), so "brk.b" and "BRK-B" are the same stock, with one URL and
 * one cache entry.
 */

/** " brk.b " → "BRK-B". Doesn't check the result is valid; see isSymbolFormat. */
export const normalizeSymbol = (input: string) => input.trim().toUpperCase().replace(/\./g, "-");

// A letter, then up to 6 letters or digits, then optionally a share class: AAPL, BRK-B.
const SYMBOL = /^[A-Z][A-Z0-9]{0,6}(-[A-Z0-9]{1,2})?$/;

/** True if `value` is a canonical symbol. Says nothing about whether the stock exists. */
export const isSymbolFormat = (value: unknown): value is string => typeof value === "string" && SYMBOL.test(value);

/**
 * The `symbol=` values of an API request, normalized and without repeats, or
 * null unless there are 1 to `max` of them, all well-formed.
 */
export function parseSymbolQuery(params: URLSearchParams, max: number): string[] | null {
  const symbols = [...new Set(params.getAll("symbol").map(normalizeSymbol))];
  if (symbols.length === 0 || symbols.length > max || !symbols.every(isSymbolFormat)) return null;
  return symbols;
}
