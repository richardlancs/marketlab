/**
 * Stock search for the ⌘K dialog. A pure function, so the ranking is easy to
 * test without a browser.
 */
import type { Stock } from "./types";

type Searchable = Pick<Stock, "symbol" | "name">;

/** Lower rank = better match. */
const Rank = { ExactSymbol: 0, SymbolPrefix: 1, NameWordPrefix: 2, Contains: 3 } as const;
type Rank = (typeof Rank)[keyof typeof Rank];

const isAlphanumeric = (char: string) => /[a-z0-9]/i.test(char);

/** True if `query` appears in `text` at the start of a word: "pl" is in "Meta Platforms" but not in "Apple". */
function startsAWord(text: string, query: string): boolean {
  for (let i = text.indexOf(query); i !== -1; i = text.indexOf(query, i + 1)) {
    if (i === 0 || !isAlphanumeric(text[i - 1])) return true;
  }
  return false;
}

function rank({ symbol, name }: Searchable, query: string): Rank | undefined {
  const s = symbol.toLowerCase();
  const n = name.toLowerCase();
  if (s === query) return Rank.ExactSymbol;
  if (s.startsWith(query)) return Rank.SymbolPrefix;
  if (startsAWord(n, query)) return Rank.NameWordPrefix;
  if (s.includes(query) || n.includes(query)) return Rank.Contains;
  return undefined;
}

/**
 * Stocks matching `query` by symbol or company name, best matches first:
 * 1. the exact symbol ("v" → V)
 * 2. symbols starting with it ("ms" → MSFT)
 * 3. a word in the name starting with it ("plat" → Meta Platforms)
 * 4. anything containing it ("flix" → Netflix)
 *
 * Case and surrounding spaces are ignored. Within a rank, symbols are A→Z. An
 * empty query matches nothing; the dialog shows its own list for that case.
 */
export function searchStocks<T extends Searchable>(query: string, stocks: readonly T[]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return stocks
    .map((stock) => ({ stock, rank: rank(stock, q) }))
    .filter((match): match is { stock: T; rank: Rank } => match.rank !== undefined)
    .sort((a, b) => a.rank - b.rank || a.stock.symbol.localeCompare(b.stock.symbol))
    .map((match) => match.stock);
}
