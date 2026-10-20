/**
 * The simulated account as this browser kept it in localStorage before
 * accounts moved to the database (guest mode used to live there). Only read
 * now, to bring it into the database once (components/account/account-provider.tsx).
 */
import { isSymbolFormat } from "./market/symbols";
import { parseAccount, type Account } from "./trading";

export const STORAGE_KEY = "marketlab:account";
/**
 * Bump this when the saved shape changes. Data saved with another version is
 * ignored (the account starts over) rather than misread.
 */
const VERSION = 1;

/** Reads the saved account, or null if there is none or it isn't valid. */
export function decodeAccount(raw: string | null, isKnown: (symbol: string) => boolean = isSymbolFormat): Account | null {
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || (data as { version?: unknown }).version !== VERSION) return null;
    return parseAccount((data as { account?: unknown }).account, isKnown);
  } catch {
    return null; // not JSON
  }
}

export const encodeAccount = (account: Account) => JSON.stringify({ version: VERSION, account });
