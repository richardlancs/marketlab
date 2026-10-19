"use server";

/**
 * Server Actions that change a signed-in user's simulated account.
 *
 * Each one is a public endpoint: anyone can POST to it without using the UI.
 * So every action:
 * - reads the user from the session cookie, never from an argument, so it can
 *   only ever touch the caller's own account;
 * - treats every argument as untrusted and validates it;
 * - takes prices from the server's own data, never from the request.
 */
import { headers } from "next/headers";
import { auth } from "./auth";
import { accounts } from "./db";
import { addAlert, markAlertsSeen, removeAlert } from "./alerts";
import { getListing, getProcessingData, getStockDetail } from "./market";
import { isSymbolFormat, normalizeSymbol } from "./market/symbols";
import { cancelPendingOrder, placePendingOrder, type NewOrder } from "./orders";
import { symbolsToProcess } from "./processing";
import { isStartingPreset } from "./starting-account";
import { MAX_HOLDINGS, MAX_WATCHLIST, parseAccount, type Account } from "./trading";

/** What the browser gets back: the account after the change, or a message to show. */
export type ActionResult = { ok: true; account: Account } | { ok: false; message: string };

const SIGNED_OUT: ActionResult = { ok: false, message: "Your session has ended. Sign in again to continue." };
const UNKNOWN: ActionResult = { ok: false, message: "Unknown stock." };

/** The canonical symbol, if `value` names a stock that exists in the current data source. */
async function realSymbol(value: unknown): Promise<string | null> {
  if (typeof value !== "string") return null;
  const symbol = normalizeSymbol(value);
  return (await getListing(symbol)) ? symbol : null;
}

/** The most different stocks a guest import may name, so it can't trigger unbounded lookups. */
const MAX_IMPORT_SYMBOLS = MAX_HOLDINGS + MAX_WATCHLIST;

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** Runs `change` for the signed-in user, then returns their account as it now is. */
async function forCurrentUser(change: (userId: string) => Promise<ActionResult | void>): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const result = await change(userId);
  if (result) return result;
  return { ok: true, account: await accounts.ensure(userId) };
}

export async function toggleWatchlistAction(input: unknown): Promise<ActionResult> {
  // Removing needs no lookup: a stock that has since disappeared can still be unwatched.
  const symbol = isSymbolFormat(input) ? input : null;
  if (!symbol) return UNKNOWN;
  return forCurrentUser(async (userId) => {
    const watched = (await accounts.load(userId))?.watchlist.includes(symbol) ?? false;
    if (!watched && !(await realSymbol(symbol))) return UNKNOWN;
    if ((await accounts.toggleWatchlist(userId, symbol)) === "full") {
      return { ok: false, message: `You can watch up to ${MAX_WATCHLIST} stocks. Remove one to make room.` };
    }
  });
}

/** The market data to bring this user's account up to date, plus any `extra` stocks an action is about to use. */
async function processingDataFor(userId: string, extra: string[] = []) {
  const account = await accounts.load(userId);
  return getProcessingData([...new Set([...(account ? symbolsToProcess(account) : []), ...extra])]);
}

/** Applies dividends, splits, order fills and alerts since the account was last brought up to date. */
export async function processAccountAction(): Promise<ActionResult> {
  return forCurrentUser(async (userId) => {
    const result = await accounts.update(userId, await processingDataFor(userId), (account) => ({ ok: true, account }));
    return result.ok ? { ok: true, account: result.account } : result;
  });
}

export async function placeOrderAction(input: unknown, side: unknown, shares: unknown): Promise<ActionResult> {
  if (typeof input !== "string" || (side !== "buy" && side !== "sell") || typeof shares !== "number") {
    return { ok: false, message: "That order isn't valid." };
  }
  return forCurrentUser(async (userId) => {
    const detail = await getStockDetail(input);
    if (!detail) return UNKNOWN;
    if (detail.status === "unavailable") return { ok: false, message: `Prices for ${detail.listing.symbol} are unavailable right now. Try again in a minute.` };
    const { stock } = detail;
    // The same rules as guest mode (lib/trading.ts), inside a database transaction,
    // after bringing the account up to date (a dividend or a fill may have changed the cash).
    const result = await accounts.placeOrder(userId, {
      symbol: stock.symbol,
      side,
      shares,
      price: stock.price,
      id: crypto.randomUUID(),
      time: Date.now(),
    }, await processingDataFor(userId, [stock.symbol]));
    return result.ok ? { ok: true, account: result.account } : { ok: false, message: result.message };
  });
}

export async function resetAccountAction(preset: unknown = "starter"): Promise<ActionResult> {
  if (!isStartingPreset(preset)) return { ok: false, message: "Choose one of the starting options." };
  return forCurrentUser((userId) => accounts.reset(userId, preset));
}

/** Runs `change` on the up-to-date account in one transaction, and returns the account or the refusal. */
async function change(userId: string, extra: string[], fn: Parameters<typeof accounts.update>[2]): Promise<ActionResult> {
  const result = await accounts.update(userId, await processingDataFor(userId, extra), fn);
  return result.ok ? { ok: true, account: result.account } : result;
}

export async function placePendingOrderAction(input: unknown): Promise<ActionResult> {
  if (typeof input !== "object" || input === null) return { ok: false, message: "That order isn't valid." };
  const { symbol, side, type, shares, price, duration } = input as Record<string, unknown>;
  if (typeof symbol !== "string" || typeof shares !== "number" || typeof price !== "number") return { ok: false, message: "That order isn't valid." };
  return forCurrentUser(async (userId) => {
    const detail = await getStockDetail(symbol);
    if (!detail) return UNKNOWN;
    const listing = detail.status === "ok" ? detail.stock : detail.listing;
    const order = { symbol: listing.symbol, side, type, shares, price, duration } as NewOrder; // each field is checked by placePendingOrder
    return change(userId, [listing.symbol], (account) => placePendingOrder(account, order, crypto.randomUUID(), Date.now()));
  });
}

export async function cancelOrderAction(id: unknown): Promise<ActionResult> {
  if (typeof id !== "string") return { ok: false, message: "That order isn't valid." };
  return forCurrentUser((userId) => change(userId, [], (account) => ({ ok: true, account: cancelPendingOrder(account, id, Date.now()) })));
}

export async function addAlertAction(input: unknown): Promise<ActionResult> {
  if (typeof input !== "object" || input === null) return { ok: false, message: "That alert isn't valid." };
  const { symbol, direction, price } = input as Record<string, unknown>;
  if (typeof price !== "number" || (direction !== "above" && direction !== "below")) return { ok: false, message: "That alert isn't valid." };
  return forCurrentUser(async (userId) => {
    const real = await realSymbol(symbol);
    if (!real) return UNKNOWN;
    return change(userId, [real], (account) => addAlert(account, { symbol: real, direction, price }, crypto.randomUUID(), Date.now()));
  });
}

export async function removeAlertAction(id: unknown): Promise<ActionResult> {
  if (typeof id !== "string") return { ok: false, message: "That alert isn't valid." };
  return forCurrentUser((userId) => change(userId, [], (account) => ({ ok: true, account: removeAlert(account, id) })));
}

export async function markAlertsSeenAction(): Promise<ActionResult> {
  return forCurrentUser((userId) => change(userId, [], (account) => ({ ok: true, account: markAlertsSeen(account) })));
}

/** Sets the account up from the starting account (the user chose not to import, or had nothing to import). */
export async function startFreshAction(): Promise<ActionResult> {
  return forCurrentUser(async () => {}); // forCurrentUser's ensure() creates it
}

/**
 * Copies a guest account from this browser into the user's new account.
 * Only allowed while they have no account yet, so it can't overwrite one.
 *
 * The guest data comes from the browser, so it's validated for shape, and
 * every stock it names must exist. Its numbers are taken as they are: guest mode never had a
 * server checking it, and since the simulator has no shared rankings, editing
 * them would only fool yourself.
 */
export async function importGuestAccountAction(guest: unknown): Promise<ActionResult> {
  const account = parseAccount(guest, isSymbolFormat);
  const unreadable: ActionResult = { ok: false, message: "That browser data couldn't be read." };
  if (!account || account.holdings.length > MAX_HOLDINGS || account.watchlist.length > MAX_WATCHLIST) return unreadable;
  const symbols = [
    ...new Set([...account.holdings, ...account.watchlist, ...account.trades, ...(account.orders ?? []), ...(account.alerts ?? [])].map((x) => (typeof x === "string" ? x : x.symbol))),
  ];
  if (symbols.length > MAX_IMPORT_SYMBOLS) return unreadable;
  return forCurrentUser(async (userId) => {
    // Checked after the session, so only signed-in users can trigger lookups.
    const real = await Promise.all(symbols.map(realSymbol));
    if (real.some((s) => s === null)) return { ok: false, message: "Your browser data names a stock that doesn't exist, so it couldn't be imported." };
    // Fresh trade, order and alert IDs: they're unique across all users, and these came from the browser.
    const fresh = <T extends { id: string }>(items: T[] | undefined) => items?.map((x) => ({ ...x, id: crypto.randomUUID() }));
    const created = await accounts.create(userId, { ...account, trades: fresh(account.trades) ?? [], orders: fresh(account.orders), alerts: fresh(account.alerts) });
    if (!created) return { ok: false, message: "Your account already has data, so nothing was imported." };
  });
}
