"use client";

import { createContext, startTransition, use, useEffect, useMemo, useOptimistic, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  addAlertAction,
  cancelOrderAction,
  importGuestAccountAction,
  markAlertsSeenAction,
  placeOrderAction,
  placePendingOrderAction,
  processAccountAction,
  removeAlertAction,
  resetAccountAction,
  startFreshAction,
  toggleWatchlistAction,
  type ActionResult,
} from "@/lib/account-actions";
import { addAlert as applyAddAlert, markAlertsSeen as applySeen, removeAlert as applyRemoveAlert } from "@/lib/alerts";
import { cancelPendingOrder, placePendingOrder as applyPendingOrder, type NewOrder } from "@/lib/orders";
import { needsProcessing, processAccount, symbolsToProcess, type MarketData } from "@/lib/processing";
import type { StockTableRow } from "@/components/stocks/stock-table-rows";
import { createLocalAccountStore } from "@/lib/account-store";
import { authClient } from "@/lib/auth-client";
import type { StockListing } from "@/lib/market/universe";
import { isStartingAccount, startingAccount, type StartingPreset } from "@/lib/starting-account";
import { placeOrder as applyOrder, toggleWatchlist as applyToggle, WATCHLIST_FULL, watchlistIsFull, type Account, type Order, type PriceAlert } from "@/lib/trading";
import type { StockQuote } from "@/lib/types";

/** What every action resolves to: success, or a message to show. */
export type Outcome = { ok: true } | { ok: false; message: string };

interface AccountContextValue {
  /**
   * The simulated account, or null while it isn't known yet: during server
   * rendering (the server can't read this browser's storage), while the
   * session or a signed-in user's account is loading, and while a new user
   * chooses whether to import their guest data. Components show a skeleton.
   */
  account: Account | null;
  /** Where the account is saved. */
  mode: "loading" | "guest" | "signed-in";
  /**
   * Signed in with no account yet, and this browser has guest data that
   * could be imported. The import prompt offers the choice.
   */
  importOffer: Account | null;
  /** A problem talking to the server, for the status banner. */
  error: string | null;
  dismissError(): void;
  /**
   * Today's price for every core stock, plus any other stock the account
   * holds or watches once it has loaded, by symbol.
   */
  quotes: Record<string, StockQuote>;
  /** Table rows (with a month of history) for held or watched stocks outside the core, by symbol. */
  extraRows: Record<string, StockTableRow>;
  /** Every catalog stock's name and sector, for search. */
  listings: readonly StockListing[];
  /** True when any real ticker can be opened (Tiingo), not just catalog ones. */
  openTickers: boolean;
  toggleWatchlist(symbol: string): Promise<Outcome>;
  /** Trades at the quote's price in guest mode; signed in, the server uses its own price. */
  placeOrder(quote: Pick<StockQuote, "symbol" | "price">, side: Order["side"], shares: number): Promise<Outcome>;
  /** A limit or stop order, filled later at a close (lib/orders.ts). */
  placePendingOrder(order: NewOrder): Promise<Outcome>;
  cancelOrder(id: string): Promise<Outcome>;
  addAlert(alert: { symbol: string; direction: PriceAlert["direction"]; price: number }): Promise<Outcome>;
  removeAlert(id: string): Promise<Outcome>;
  /** The user has seen their triggered alerts: clears the header badge. */
  markAlertsSeen(): Promise<Outcome>;
  /** Back to a starting account (holdings, cash and watchlist), with no history. */
  reset(preset?: StartingPreset): Promise<Outcome>;
  /** For importOffer: copy the guest data into the account, or start fresh. */
  resolveImport(choice: "import" | "fresh"): Promise<Outcome>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

type Failure = Extract<Outcome, { ok: false }>;

const OFFLINE: Failure = { ok: false, message: "Couldn't reach the server. Check your connection and try again." };

/**
 * Gives every component below it the account and the actions that change it.
 *
 * - Signed out (guest mode): the account lives in this browser's localStorage.
 * - Signed in: it lives in the database. It's fetched from /api/account, and
 *   changes go through Server Actions. useOptimistic shows each change at once,
 *   then the server's answer replaces it (or undoes it, if refused).
 *
 * Both paths apply the same rules (lib/trading.ts), so components don't need
 * to know which one they're using.
 */
export function AccountProvider({
  quotes,
  listings,
  openTickers,
  asOf,
  children,
}: {
  quotes: StockQuote[];
  listings: readonly StockListing[];
  openTickers: boolean;
  /** The market's latest close: accounts are brought up to date to here (lib/processing.ts). */
  asOf: number;
  children: ReactNode;
}) {
  const coreQuotes = useMemo(() => Object.fromEntries(quotes.map((q) => [q.symbol, q])), [quotes]);
  // useState's initializer runs once, so the store is created once per page load.
  const [store] = useState(() => createLocalAccountStore());
  // The third argument is what the server (and hydration) sees: null, "not loaded".
  const guestAccount = useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);

  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user.id ?? null;

  // The signed-in user's account as the server last reported it. Tagged with
  // the user's ID, so a different user's data is never shown after switching.
  const [remote, setRemote] = useState<{ userId: string; account: Account | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serverAccount = remote && remote.userId === userId ? remote.account : undefined; // undefined: not loaded
  const [optimisticAccount, applyOptimistic] = useOptimistic(serverAccount ?? null, (current: Account | null, change: (a: Account) => Account) =>
    current ? change(current) : current,
  );

  // Load the signed-in user's account whenever the user changes.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch("/api/account", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { account: Account | null }) => {
        if (!cancelled) setRemote({ userId, account: data.account });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your account. Reload the page to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /**
   * Runs a Server Action in a transition: shows `optimistic` straight away,
   * then stores the account the server returns. If the server refuses or
   * can't be reached, the optimistic change is dropped, and unless the caller
   * shows the message itself (`quiet`), it goes to the status banner.
   */
  function runRemote(
    uid: string,
    optimistic: ((a: Account) => Account) | null,
    call: () => Promise<ActionResult>,
    { quiet = false } = {},
  ): Promise<Outcome> {
    const fail = (outcome: Failure) => {
      if (!quiet) setError(outcome.message);
      return outcome;
    };
    return new Promise((resolve) => {
      startTransition(async () => {
        if (optimistic) applyOptimistic(optimistic);
        let result: ActionResult;
        try {
          result = await call();
        } catch {
          resolve(fail(OFFLINE));
          return;
        }
        if (result.ok) {
          const account = result.account;
          // State set after an `await` needs its own transition, or React would
          // show it separately from the optimistic value it replaces.
          startTransition(() => setRemote({ userId: uid, account }));
          setError(null);
          resolve({ ok: true });
        } else {
          resolve(fail({ ok: false, message: result.message }));
        }
      });
    });
  }

  // A new user whose browser holds only the untouched starting account has
  // nothing worth importing, so set them up straight away instead of asking.
  const needsSetup = userId !== null && serverAccount === null;
  const guestIsUntouched = guestAccount !== null && isStartingAccount(guestAccount);
  useEffect(() => {
    if (needsSetup && guestIsUntouched && userId) void runRemote(userId, null, startFreshAction);
    // runRemote is recreated each render but only uses stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSetup, guestIsUntouched, userId]);

  const mode: AccountContextValue["mode"] = sessionPending ? "loading" : userId ? "signed-in" : "guest";
  const account = mode === "guest" ? guestAccount : mode === "signed-in" ? optimisticAccount : null;
  const importOffer = needsSetup && guestAccount && !guestIsUntouched ? guestAccount : null;

  /**
   * Guest mode: brings the browser's account up to date with the market
   * (dividends, splits, order fills, alerts since the last visit), using
   * traded closes from /api/history. Signed in, the server does the same in
   * processAccountAction. Resolves once the account is current (or the data
   * couldn't be loaded, in which case it's tried again next time).
   */
  async function processGuest(): Promise<void> {
    const current = store.getSnapshot();
    if (!needsProcessing(current, asOf)) return;
    const symbols = symbolsToProcess(current);
    let market: MarketData = { raw: {}, actions: {}, latest: asOf };
    if (current.processedThrough !== undefined && symbols.length) {
      const query = [...symbols.map((s) => `symbol=${encodeURIComponent(s)}`), `from=${current.processedThrough}`, "raw=1", "actions=1"].join("&");
      try {
        const response = await fetch(`/api/history?${query}`);
        if (!response.ok) return;
        const data: { history: MarketData["raw"]; actions: MarketData["actions"] } = await response.json();
        market = { raw: data.history, actions: data.actions, latest: asOf };
      } catch {
        return;
      }
    }
    // Re-read: another tab may have processed (or traded) meanwhile.
    const latest = store.getSnapshot();
    const processed = processAccount(latest, market);
    if (processed !== latest) store.set(processed);
  }

  const guestStale = mode === "guest" && guestAccount !== null && needsProcessing(guestAccount, asOf);
  useEffect(() => {
    if (guestStale) void processGuest();
    // processGuest reads the store directly; it only needs to run when the account falls behind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestStale, asOf]);

  const serverStale = mode === "signed-in" && serverAccount != null && needsProcessing(serverAccount, asOf);
  useEffect(() => {
    if (serverStale && userId) void runRemote(userId, null, processAccountAction, { quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverStale, userId]);

  // Prices for held or watched stocks outside the core, which the layout
  // doesn't send. Fetched again only when that set of symbols changes; a
  // symbol whose prices are unavailable is simply left out (shown as "—").
  const extraKey = account
    ? [...new Set([...account.holdings.map((h) => h.symbol), ...account.watchlist])].filter((s) => !coreQuotes[s]).sort().join(",")
    : "";
  // Rows from an earlier set of symbols are kept: they still help while the new set loads.
  const [extraRows, setExtraRows] = useState<Record<string, StockTableRow>>({});
  useEffect(() => {
    if (!extraKey) return;
    let cancelled = false;
    const query = extraKey
      .split(",")
      .map((s) => `symbol=${encodeURIComponent(s)}`)
      .join("&");
    fetch(`/api/quotes?${query}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { rows: StockTableRow[] }) => {
        if (!cancelled) setExtraRows(Object.fromEntries(data.rows.map((row) => [row.symbol, row])));
      })
      .catch(() => {
        // Positions without a price are valued at cost until the next try.
      });
    return () => {
      cancelled = true;
    };
  }, [extraKey]);
  const quoteMap = useMemo(() => ({ ...extraRows, ...coreQuotes }), [extraRows, coreQuotes]);

  const value: AccountContextValue = {
    account,
    mode,
    importOffer,
    error,
    dismissError: () => setError(null),
    quotes: quoteMap,
    extraRows,
    listings,
    openTickers,

    async toggleWatchlist(symbol) {
      if (account && watchlistIsFull(account, symbol)) {
        setError(WATCHLIST_FULL);
        return { ok: false, message: WATCHLIST_FULL };
      }
      if (userId) return runRemote(userId, (a) => applyToggle(a, symbol), () => toggleWatchlistAction(symbol));
      store.set(applyToggle(store.getSnapshot(), symbol));
      return { ok: true };
    },

    async placeOrder({ symbol, price }, side, shares) {
      // The ID and time are made here, in an event handler, so the rules in
      // lib/trading.ts stay pure. (Signed in, the server makes its own.)
      const order = { symbol, side, shares, price, id: crypto.randomUUID(), time: Date.now() };
      if (userId) {
        const optimistic = (a: Account) => {
          const result = applyOrder(a, order);
          return result.ok ? result.account : a;
        };
        // quiet: the trade form shows its own errors.
        return runRemote(userId, optimistic, () => placeOrderAction(symbol, side, shares), { quiet: true });
      }
      await processGuest(); // a dividend or a fill since the last visit may have changed the cash
      const result = applyOrder(store.getSnapshot(), order);
      if (!result.ok) return { ok: false, message: result.message };
      store.set(result.account);
      return { ok: true };
    },

    async placePendingOrder(input) {
      // The ID and time are made here, in an event handler, so the rules stay pure.
      const id = crypto.randomUUID();
      const now = Date.now();
      if (userId) {
        const optimistic = (a: Account) => {
          const result = applyPendingOrder(a, input, id, now);
          return result.ok ? result.account : a;
        };
        return runRemote(userId, optimistic, () => placePendingOrderAction(input), { quiet: true });
      }
      await processGuest();
      const result = applyPendingOrder(store.getSnapshot(), input, id, now);
      if (!result.ok) return { ok: false, message: result.message };
      store.set(result.account);
      return { ok: true };
    },

    async cancelOrder(id) {
      const now = Date.now();
      if (userId) return runRemote(userId, (a) => cancelPendingOrder(a, id, now), () => cancelOrderAction(id));
      await processGuest(); // it may have filled already
      store.set(cancelPendingOrder(store.getSnapshot(), id, now));
      return { ok: true };
    },

    async addAlert(input) {
      const id = crypto.randomUUID();
      const now = Date.now();
      if (userId) {
        const optimistic = (a: Account) => {
          const result = applyAddAlert(a, input, id, now);
          return result.ok ? result.account : a;
        };
        return runRemote(userId, optimistic, () => addAlertAction(input), { quiet: true });
      }
      await processGuest();
      const result = applyAddAlert(store.getSnapshot(), input, id, now);
      if (!result.ok) return { ok: false, message: result.message };
      store.set(result.account);
      return { ok: true };
    },

    async removeAlert(id) {
      if (userId) return runRemote(userId, (a) => applyRemoveAlert(a, id), () => removeAlertAction(id));
      store.set(applyRemoveAlert(store.getSnapshot(), id));
      return { ok: true };
    },

    async markAlertsSeen() {
      if (userId) return runRemote(userId, applySeen, markAlertsSeenAction, { quiet: true });
      store.set(applySeen(store.getSnapshot()));
      return { ok: true };
    },

    async reset(preset = "starter") {
      if (userId) return runRemote(userId, () => startingAccount(preset), () => resetAccountAction(preset));
      store.set(startingAccount(preset));
      return { ok: true };
    },

    async resolveImport(choice) {
      if (!userId || !guestAccount) return { ok: false, message: "Nothing to import." };
      const outcome = await runRemote(userId, null, choice === "import" ? () => importGuestAccountAction(guestAccount) : startFreshAction, {
        quiet: true, // the import prompt shows its own errors
      });
      // Imported data has moved to the account, so this browser's guest
      // account starts over (and won't be offered again for another account).
      if (outcome.ok && choice === "import") store.set(startingAccount());
      return outcome;
    },
  };

  return <AccountContext value={value}>{children}</AccountContext>;
}

/** The account and its actions. Must be used inside <AccountProvider>. */
export function useAccount(): AccountContextValue {
  const value = use(AccountContext);
  if (!value) throw new Error("useAccount must be used inside <AccountProvider>");
  return value;
}
