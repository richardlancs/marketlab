// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAccountStore, decodeAccount, encodeAccount, STORAGE_KEY } from "./account-store";
import { startingAccount } from "./starting-account";
import type { Account } from "./trading";

const SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "JPM", "TSLA", "META", "NFLX"];

/** A minimal in-memory stand-in for the browser's localStorage and window. */
function fakeBrowser() {
  const data = new Map<string, string>();
  const handlers = new Set<(e: { key: string | null }) => void>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  vi.stubGlobal("window", {
    addEventListener: (_: string, h: (e: { key: string | null }) => void) => handlers.add(h),
    removeEventListener: (_: string, h: (e: { key: string | null }) => void) => handlers.delete(h),
  });
  return {
    data,
    handlers,
    /** Simulates another tab writing the account. */
    otherTabWrites(account: Account) {
      data.set(STORAGE_KEY, encodeAccount(account));
      handlers.forEach((h) => h({ key: STORAGE_KEY }));
    },
  };
}

describe("decodeAccount", () => {
  it("round-trips an account", () => {
    expect(decodeAccount(encodeAccount(startingAccount()), SYMBOLS)).toEqual(startingAccount());
  });

  it.each([
    ["nothing saved", null],
    ["not JSON", "{oops"],
    ["another version", JSON.stringify({ version: 99, account: startingAccount() })],
    ["an invalid account", JSON.stringify({ version: 1, account: { cash: "lots" } })],
  ])("returns null for %s", (_, raw) => {
    expect(decodeAccount(raw, SYMBOLS)).toBeNull();
  });
});

describe("createLocalAccountStore", () => {
  let browser: ReturnType<typeof fakeBrowser>;
  beforeEach(() => {
    browser = fakeBrowser();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts from the starting account when nothing is saved", () => {
    expect(createLocalAccountStore(SYMBOLS).getSnapshot()).toEqual(startingAccount());
  });

  it("returns the same object until the data changes (required by useSyncExternalStore)", () => {
    const store = createLocalAccountStore(SYMBOLS);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it("saves changes and tells subscribers", () => {
    const store = createLocalAccountStore(SYMBOLS);
    const listener = vi.fn();
    store.subscribe(listener);
    const next = { ...startingAccount(), cash: 5 };
    store.set(next);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(next);
    expect(decodeAccount(browser.data.get(STORAGE_KEY) ?? null, SYMBOLS)).toEqual(next);
  });

  it("picks up changes made in another tab", () => {
    const store = createLocalAccountStore(SYMBOLS);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    browser.otherTabWrites({ ...startingAccount(), cash: 7 });
    expect(listener).toHaveBeenCalled();
    expect(store.getSnapshot().cash).toBe(7);
    unsubscribe();
    expect(browser.handlers.size).toBe(0); // the storage listener is removed with the last subscriber
  });

  it("falls back to the starting account if the saved data is corrupt", () => {
    browser.data.set(STORAGE_KEY, "garbage");
    expect(createLocalAccountStore(SYMBOLS).getSnapshot()).toEqual(startingAccount());
  });

  it("keeps working in memory when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const store = createLocalAccountStore(SYMBOLS);
    const next = { ...startingAccount(), cash: 1 };
    store.set(next);
    expect(store.getSnapshot()).toBe(next);
  });
});
