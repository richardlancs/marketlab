"use client";

import { createContext, startTransition, use, useEffect, useMemo, useOptimistic, useState, type ReactNode } from "react";
import {
  addAlertAction,
  cancelOrderAction,
  annotateTradeAction,
  importBrowserAccountAction,
  markAlertsSeenAction,
  placeOrderAction,
  placeOptionOrderAction,
  placePendingOrderAction,
  processAccountAction,
  removeAlertAction,
  resetAccountAction,
  resolveGuestPortfolioAction,
  toggleWatchlistAction,
  type ActionResult,
} from "@/lib/account-actions";
import { addAlert as applyAddAlert, markAlertsSeen as applySeen, removeAlert as applyRemoveAlert } from "@/lib/alerts";
import { bracketOrders, cancelPendingOrder, placePendingOrder as applyPendingOrder, type NewOrder } from "@/lib/orders";
import { needsProcessing } from "@/lib/processing";
import type { StockTableRow } from "@/components/stocks/stock-table-rows";
import { decodeAccount, STORAGE_KEY } from "@/lib/account-store";
import { authClient } from "@/lib/auth-client";
import type { StockListing } from "@/lib/market/universe";
import { isStartingAccount, startingAccount, type StartingPreset } from "@/lib/starting-account";
import { annotateTrade, placeOrder as applyOrder, toggleWatchlist as applyToggle, WATCHLIST_FULL, watchlistIsFull, type Account, type Bracket, type Order, type PriceAlert, type AlertCondition, type TradeReason } from "@/lib/trading";

/** A trade's optional reason and note (trade notes). */
export type Journal = { reason?: TradeReason; note?: string };
import type { StockQuote } from "@/lib/types";
import type { BookInfo } from "@/lib/books";
import { chooseBookAction } from "@/lib/season-actions";

/** What every action resolves to: success, or a message to show. */
export type Outcome = { ok: true } | { ok: false; message: string };

interface AccountContextValue {
  /**
   * The simulated account, or null while it's loading (including during
   * server rendering: whose account it is depends on this browser's cookies).
   * Components show a skeleton.
   */
  account: Account | null;
  /** Whose account it is: this browser's guest, or the signed-in user's. Both are saved in the database. */
  mode: "loading" | "guest" | "signed-in";
  /**
   * Just signed in, and this browser's guest had a portfolio of its own as
   * well as the account: the guest's, while the user chooses which to keep.
   */
  pendingGuest: Account | null;
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
  /** Shown at the quote's price straight away; the server then trades at its own price. `extras`: selling short, and a bracket to place once it fills. */
  placeOrder(quote: Pick<StockQuote, "symbol" | "price">, side: Order["side"], shares: number, journal?: Journal, extras?: { short?: boolean; bracket?: Bracket }): Promise<Outcome>;
  /** Adds, changes or clears a past trade's reason and note. */
  annotateTrade(id: string, journal: Journal): Promise<Outcome>;
  /** A limit, stop or trailing stop order, filled later at a close (lib/orders.ts). `marketPrice` starts a trailing stop in the instant view. */
  placePendingOrder(order: NewOrder, marketPrice?: number): Promise<Outcome>;
  /** Buys or sells option contracts at the chain's price (lib/option-trading.ts). Not shown until the server confirms. */
  placeOptionOrder(order: { symbol: string; kind: "call" | "put"; strike: number; expiry: string; side: "buy" | "sell"; contracts: number }): Promise<Outcome>;
  cancelOrder(id: string): Promise<Outcome>;
  addAlert(alert: { symbol: string; direction: PriceAlert["direction"]; price: number; condition?: AlertCondition }): Promise<Outcome>;
  removeAlert(id: string): Promise<Outcome>;
  /** The user has seen their triggered alerts: clears the header badge. */
  markAlertsSeen(): Promise<Outcome>;
  /** Back to a starting account (holdings, cash and watchlist), with no history. */
  reset(preset?: StartingPreset): Promise<Outcome>;
  /** For pendingGuest: keep the account's portfolio, or replace it with the guest's. */
  resolvePendingGuest(choice: "keep-account" | "use-guest"): Promise<Outcome>;
  /** The portfolio being traded in (lib/books.ts): practice, or a season's. */
  book: BookInfo;
  /** The portfolios this person can switch between (just practice, unless they've joined a season). */
  books: BookInfo[];
  /** Switches to another portfolio: null for practice, or a season portfolio's id. */
  chooseBook(id: string | null): Promise<Outcome>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/** Matches lib/books.ts PRACTICE (that module is server-only). */
const PRACTICE_BOOK: BookInfo = { id: null, label: "Practice portfolio", seasonId: null, readOnly: false };

type Failure = Extract<Outcome, { ok: false }>;

const OFFLINE: Failure = { ok: false, message: "Couldn't reach the server. Check your connection and try again." };

/** Server data is tagged with whose it is, so one person's account is never shown after switching to another. */
type Remote = { owner: string; account: Account; pending: Account | null; book: BookInfo; books: BookInfo[] };

/**
 * Gives every component below it the account and the actions that change it.
 *
 * Every account lives in the database: a signed-in user's, or, signed out,
 * this browser's guest's (lib/owner.ts). It's fetched from /api/account
 * (again whenever someone signs in or out), and changes go through Server
 * Actions, which apply the shared rules (lib/trading.ts) with the server's
 * own prices. useOptimistic shows each change at once, then the server's
 * answer replaces it (or undoes it, if refused).
 *
 * Accounts that this browser kept in localStorage before (guest mode used to
 * live there) are brought into the database once, then removed.
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
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userId = session?.user.id ?? null;
  // Whose account to show: the user, or this browser's guest. Null until the session is known.
  const ownerKey = sessionPending ? null : (userId ?? "guest");

  const [remote, setRemote] = useState<Remote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serverAccount = remote && remote.owner === ownerKey ? remote.account : null;
  const [optimisticAccount, applyOptimistic] = useOptimistic(serverAccount, (current: Account | null, change: (a: Account) => Account) =>
    current ? change(current) : current,
  );

  // Load the account whenever whose it is changes (signing in hands a guest's data over on the server).
  useEffect(() => {
    if (!ownerKey) return;
    let cancelled = false;
    async function load(key: string) {
      try {
        await importFromBrowser();
        const response = await fetch("/api/account", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data: { account: Account; pending: Account | null; book?: BookInfo; books?: BookInfo[] } = await response.json();
        if (!cancelled) setRemote({ owner: key, account: data.account, pending: data.pending, book: data.book ?? PRACTICE_BOOK, books: data.books ?? [PRACTICE_BOOK] });
      } catch {
        if (!cancelled) setError("Couldn't load your account. Reload the page to try again.");
      }
    }
    void load(ownerKey);
    return () => {
      cancelled = true;
    };
  }, [ownerKey]);

  /**
   * Runs a Server Action in a transition: shows `optimistic` straight away,
   * then stores the account the server returns. If the server refuses or
   * can't be reached, the optimistic change is dropped, and unless the caller
   * shows the message itself (`quiet`), it goes to the status banner.
   */
  function runRemote(optimistic: ((a: Account) => Account) | null, call: () => Promise<ActionResult>, { quiet = false } = {}): Promise<Outcome> {
    const key = ownerKey;
    const fail = (outcome: Failure) => {
      if (!quiet) setError(outcome.message);
      return outcome;
    };
    if (!key) return Promise.resolve(fail({ ok: false, message: "Your account is still loading. Try again in a moment." }));
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
          startTransition(() =>
            setRemote((r) => ({ owner: key, account, pending: r?.owner === key ? r.pending : null, book: r?.owner === key ? r.book : PRACTICE_BOOK, books: r?.owner === key ? r.books : [PRACTICE_BOOK] })),
          );
          setError(null);
          resolve({ ok: true });
        } else {
          resolve(fail({ ok: false, message: result.message }));
        }
      });
    });
  }

  // Dividends, splits, order fills and alerts since the last visit are applied on the server.
  const stale = serverAccount !== null && needsProcessing(serverAccount, asOf);
  useEffect(() => {
    if (stale) void runRemote(null, processAccountAction, { quiet: true });
    // runRemote is recreated each render but only uses stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, ownerKey]);

  const mode: AccountContextValue["mode"] = !ownerKey ? "loading" : userId ? "signed-in" : "guest";
  const account = optimisticAccount;
  const pendingGuest = remote && remote.owner === ownerKey ? remote.pending : null;

  // Prices for held or watched stocks outside the core, which the layout
  // doesn't send. Fetched again only when that set of symbols changes; a
  // symbol whose prices are unavailable is simply left out (shown as "—").
  const extraKey = account
    ? [...new Set([...account.holdings.map((h) => h.symbol), ...(account.options ?? []).map((o) => o.symbol), ...account.watchlist])].filter((s) => !coreQuotes[s]).sort().join(",")
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

  /** Today's prices, to value short positions in the instant view. */
  const quoteMarks = () => Object.fromEntries(Object.values(quoteMap).map((q) => [q.symbol, q.price]));

  /** Applies `apply` optimistically if it succeeds on the current account; the server re-checks it. */
  const tryOptimistic = (apply: (a: Account) => { ok: true; account: Account } | { ok: false }) => (a: Account) => {
    const result = apply(a);
    return result.ok ? result.account : a;
  };

  const value: AccountContextValue = {
    account,
    mode,
    pendingGuest,
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
      return runRemote((a) => applyToggle(a, symbol), () => toggleWatchlistAction(symbol));
    },

    async placeOrder({ symbol, price }, side, shares, journal, extras) {
      // Only for the optimistic view: the server makes its own ID and time, at its own price.
      const short = side === "sell" && extras?.short === true;
      const order: Order = { symbol, side, shares, price, id: crypto.randomUUID(), time: Date.now(), ...(short && { short }), ...journal };
      const withBracket = (a: Account) => (extras?.bracket ? { ...a, orders: [...bracketOrders({ id: order.id, symbol, shares, short, bracket: extras.bracket }, order.time), ...(a.orders ?? [])] } : a);
      // quiet: the trade form shows its own errors.
      return runRemote(
        tryOptimistic((a) => {
          const result = applyOrder(a, order, quoteMarks());
          return result.ok ? { ok: true, account: withBracket(result.account) } : result;
        }),
        () => placeOrderAction(symbol, side, shares, journal, extras),
        { quiet: true },
      );
    },

    async annotateTrade(id, journal) {
      return runRemote((a) => annotateTrade(a, id, journal.reason, journal.note), () => annotateTradeAction(id, journal), { quiet: true });
    },

    async placePendingOrder(input, marketPrice) {
      const id = crypto.randomUUID();
      const now = Date.now();
      return runRemote(
        tryOptimistic((a) => applyPendingOrder(a, input, id, now, marketPrice)),
        () => placePendingOrderAction(input),
        { quiet: true },
      );
    },

    async placeOptionOrder(input) {
      return runRemote(null, () => placeOptionOrderAction(input), { quiet: true });
    },

    async cancelOrder(id) {
      const now = Date.now();
      return runRemote((a) => cancelPendingOrder(a, id, now), () => cancelOrderAction(id));
    },

    async addAlert(input) {
      const id = crypto.randomUUID();
      const now = Date.now();
      return runRemote(
        tryOptimistic((a) => applyAddAlert(a, input, id, now)),
        () => addAlertAction(input),
        { quiet: true },
      );
    },

    async removeAlert(id) {
      return runRemote((a) => applyRemoveAlert(a, id), () => removeAlertAction(id));
    },

    async markAlertsSeen() {
      return runRemote(applySeen, markAlertsSeenAction, { quiet: true });
    },

    async reset(preset: StartingPreset = "starter") {
      return runRemote(() => startingAccount(preset), () => resetAccountAction(preset));
    },

    async resolvePendingGuest(choice) {
      if (!pendingGuest) return { ok: false, message: "There's nothing to choose." };
      const outcome = await runRemote(null, () => resolveGuestPortfolioAction(choice), { quiet: true }); // the prompt shows its own errors
      if (outcome.ok) setRemote((r) => (r ? { ...r, pending: null } : r));
      return outcome;
    },

    book: remote && remote.owner === ownerKey ? remote.book : PRACTICE_BOOK,
    books: remote && remote.owner === ownerKey ? remote.books : [PRACTICE_BOOK],

    async chooseBook(id) {
      const key = ownerKey;
      if (!key) return { ok: false, message: "Your account is still loading. Try again in a moment." };
      try {
        const result = await chooseBookAction(id);
        if (!result.ok) return result;
        startTransition(() => setRemote((r) => ({ owner: key, account: result.account, pending: r?.owner === key ? r.pending : null, book: result.book, books: result.books })));
        return { ok: true };
      } catch {
        return OFFLINE;
      }
    },
  };

  return <AccountContext value={value}>{children}</AccountContext>;
}

/**
 * Brings an account this browser kept in localStorage (before accounts moved
 * to the database) into the current one, once. The server only takes it if
 * the current account is untouched, so it never overwrites anything; if it's
 * refused, it stays in the browser and is tried again on a later visit (say,
 * signed out, where it can become the guest's).
 */
async function importFromBrowser() {
  let saved: Account | null = null;
  try {
    saved = decodeAccount(localStorage.getItem(STORAGE_KEY));
    if (saved && isStartingAccount(saved)) {
      localStorage.removeItem(STORAGE_KEY); // nothing worth importing
      return;
    }
    if (!saved || sessionStorage.getItem("marketlab:import-tried")) return;
    sessionStorage.setItem("marketlab:import-tried", "1"); // once per visit, not on every page
  } catch {
    return; // storage blocked: nothing to import
  }
  const result = await importBrowserAccountAction(saved).catch(() => null);
  if (result?.ok) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}

/** The account and its actions. Must be used inside <AccountProvider>. */
export function useAccount(): AccountContextValue {
  const value = use(AccountContext);
  if (!value) throw new Error("useAccount must be used inside <AccountProvider>");
  return value;
}
