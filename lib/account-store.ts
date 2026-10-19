/**
 * Guest mode's storage: the simulated account, saved in this browser's
 * localStorage. Shaped for React's useSyncExternalStore: `subscribe` registers
 * a listener and `getSnapshot` returns the current account.
 *
 * getSnapshot must return the *same object* until the data actually changes,
 * or React would re-render forever. So the parsed account is cached and only
 * re-parsed when the raw stored string differs from last time.
 */
import { startingAccount } from "./starting-account";
import { parseAccount, type Account } from "./trading";

export const STORAGE_KEY = "marketlab:account";
/**
 * Bump this when the saved shape changes. Data saved with another version is
 * ignored (the account starts over) rather than misread.
 */
const VERSION = 1;

export interface AccountStore {
  getSnapshot(): Account;
  subscribe(listener: () => void): () => void;
  set(account: Account): void;
}

/** Reads the saved account, or null if there is none or it isn't valid. */
export function decodeAccount(raw: string | null, symbols: readonly string[]): Account | null {
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || (data as { version?: unknown }).version !== VERSION) return null;
    return parseAccount((data as { account?: unknown }).account, symbols);
  } catch {
    return null; // not JSON
  }
}

export const encodeAccount = (account: Account) => JSON.stringify({ version: VERSION, account });

/** `symbols` are the stocks that exist, so saved data naming any other is rejected. */
export function createLocalAccountStore(symbols: readonly string[]): AccountStore {
  let cachedRaw: string | null | undefined; // undefined: not read yet
  let cached: Account = startingAccount();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  // Another tab changed the account: re-read it here too. (The `storage`
  // event only fires in *other* tabs, never the one that wrote.) A null key
  // means that tab cleared all storage.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) notify();
  };

  return {
    getSnapshot() {
      let raw: string | null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch {
        return cached; // storage is blocked (some private modes): keep the account in memory
      }
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cached = decodeAccount(raw, symbols) ?? startingAccount();
      }
      return cached;
    },

    subscribe(listener) {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },

    set(account) {
      cached = account;
      try {
        const raw = encodeAccount(account);
        localStorage.setItem(STORAGE_KEY, raw);
        cachedRaw = raw;
      } catch {
        // Blocked or full: the change still applies for this visit, in memory.
      }
      notify();
    },
  };
}
