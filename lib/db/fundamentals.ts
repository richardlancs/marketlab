/**
 * Stored company numbers from the SEC (company_facts), one row per symbol.
 * See lib/fundamentals.ts for how they're fetched and refreshed.
 */
import { asc, eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { CompanyFacts } from "../market/fundamentals";
import * as schema from "./schema";

type Db = LibSQLDatabase<typeof schema>;
const { companyFacts } = schema;

function parse(data: string | null): CompanyFacts | null {
  if (data === null) return null;
  try {
    return JSON.parse(data) as CompanyFacts;
  } catch {
    return null;
  }
}

export function createFundamentalsRepository(db: Db) {
  return {
    /** The stored numbers: undefined if never fetched, null if the company has none. */
    async get(symbol: string): Promise<CompanyFacts | null | undefined> {
      const [row] = await db.select({ data: companyFacts.data }).from(companyFacts).where(eq(companyFacts.symbol, symbol));
      return row ? parse(row.data) : undefined;
    },

    /** Every stored company that has numbers. */
    async all(): Promise<Map<string, CompanyFacts>> {
      const rows = await db.select({ symbol: companyFacts.symbol, data: companyFacts.data }).from(companyFacts);
      const map = new Map<string, CompanyFacts>();
      for (const row of rows) {
        const facts = parse(row.data);
        if (facts) map.set(row.symbol, facts);
      }
      return map;
    },

    /** Of `symbols`, those never fetched or last fetched before `before`: never-fetched first, then the oldest. */
    async due(symbols: readonly string[], before: number): Promise<string[]> {
      if (symbols.length === 0) return [];
      const rows = await db.select({ symbol: companyFacts.symbol, fetchedAt: companyFacts.fetchedAt }).from(companyFacts).where(inArray(companyFacts.symbol, [...symbols])).orderBy(asc(companyFacts.fetchedAt));
      const seen = new Set(rows.map((r) => r.symbol));
      return [...symbols.filter((s) => !seen.has(s)), ...rows.filter((r) => r.fetchedAt < before).map((r) => r.symbol)];
    },

    async save(symbol: string, facts: CompanyFacts | null, now: number): Promise<void> {
      const values = { data: facts ? JSON.stringify(facts) : null, filed: facts?.filed ?? null, fetchedAt: now };
      await db.insert(companyFacts).values({ symbol, ...values }).onConflictDoUpdate({ target: companyFacts.symbol, set: values });
    },
  };
}
