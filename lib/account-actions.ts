"use server";

/**
 * Server Actions that change a simulated account: a signed-in user's, or
 * this browser's guest's (lib/owner.ts; a guest is created on their first
 * change).
 *
 * Each one is a public endpoint: anyone can POST to it without using the UI.
 * So every action:
 * - reads whose account it is from the session or guest cookie, never from an
 *   argument, so it can only ever touch the caller's own account;
 * - treats every argument as untrusted and validates it;
 * - takes prices from the server's own data, never from the request.
 */
import { accounts, guests } from "./db";
import { addAlert, markAlertsSeen, removeAlert } from "./alerts";
import { getListing, getProcessingData, getStockDetail } from "./market";
import { isSymbolFormat, normalizeSymbol } from "./market/symbols";
import { bracketOrders, bracketProblem, cancelPendingOrder, placePendingOrder, type NewOrder } from "./orders";
import { contractPrice, getChain, refreshOptionMarks } from "./options/server";
import { expiryTime, tradePrice } from "./option-trading";
import { symbolsToProcess } from "./processing";
import { checkBadgesLater } from "./badge-check";
import { bookView, currentBook } from "./books";
import { clearGuestCookie, currentOwner } from "./owner";
import { isStartingPreset } from "./starting-account";
import { annotateTrade, annotation, isNote, isTradeReason, MAX_HOLDINGS, MAX_WATCHLIST, NOTE_LENGTH, parseAccount, type Account, type Bracket, type Trail, type TradeReason } from "./trading";
import { visitorAccount } from "./visitor-account";

/** What the browser gets back: the account after the change, or a message to show. */
export type ActionResult = { ok: true; account: Account } | { ok: false; message: string };

const NO_OWNER: ActionResult = { ok: false, message: "Couldn't save that. Reload the page and try again." };
const UNKNOWN: ActionResult = { ok: false, message: "Unknown stock." };

/** The canonical symbol, if `value` names a stock that exists in the current data source. */
async function realSymbol(value: unknown): Promise<string | null> {
  if (typeof value !== "string") return null;
  const symbol = normalizeSymbol(value);
  return (await getListing(symbol)) ? symbol : null;
}

/** The most different stocks an import may name, so it can't trigger unbounded lookups. */
const MAX_IMPORT_SYMBOLS = MAX_HOLDINGS + MAX_WATCHLIST;

/**
 * Runs `change` for this request's owner (creating a guest if needed), then
 * returns their account as it now is: for `"own"`, on their own account (the
 * watchlist, alerts and imports, which are personal); for `"book"`, on the
 * portfolio they're trading in (lib/books.ts: practice, or a season's).
 * Either way the answer is the chosen book's view.
 */
async function forCurrentUser(target: "own" | "book", change: (userId: string) => Promise<ActionResult | void>): Promise<ActionResult> {
  const owner = await currentOwner({ create: true });
  if (!owner) return NO_OWNER;
  const book = await currentBook(owner);
  if (target === "book" && book && book.closedAt !== null) return SEASON_OVER;
  const id = target === "book" && book ? book.accountId : owner.id;
  const result = await change(id);
  if (result && !result.ok) return result;
  return { ok: true, account: await bookView(owner.id, book, result ? { id, account: result.account } : undefined) };
}

const SEASON_OVER: ActionResult = { ok: false, message: "That season is over, so its portfolio can't trade any more. Switch back to your practice portfolio to trade." };

export async function toggleWatchlistAction(input: unknown): Promise<ActionResult> {
  // Removing needs no lookup: a stock that has since disappeared can still be unwatched.
  const symbol = isSymbolFormat(input) ? input : null;
  if (!symbol) return UNKNOWN;
  return forCurrentUser("own", async (userId) => {
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
  // Nothing saved yet: nothing to catch up, and no reason to create a guest.
  if (!(await currentOwner({ create: false }))) return { ok: true, account: await visitorAccount() };
  // Both: the own account carries the alerts, the book the trades and orders.
  await forCurrentUser("own", async (userId) => {
    const result = await accounts.update(userId, await processingDataFor(userId), (account) => ({ ok: true, account }));
    return result.ok ? { ok: true, account: result.account } : result;
  });
  return forCurrentUser("book", async (userId) => {
    const result = await accounts.update(userId, await processingDataFor(userId), (account) => ({ ok: true, account }));
    if (result.ok && (await refreshOptionMarks(userId, result.account))) return { ok: true, account: (await accounts.load(userId)) ?? result.account };
    return result.ok ? { ok: true, account: result.account } : result;
  });
}

/** An optional reason and note from the browser: each must be valid if given, or the whole request is refused. */
function parseJournal(value: unknown): { reason?: TradeReason; note?: string } | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object") return null;
  const { reason, note } = value as Record<string, unknown>;
  if (reason !== undefined && reason !== null && !isTradeReason(reason)) return null;
  if (note !== undefined && note !== null && note !== "" && !isNote(note)) return null;
  return annotation(isTradeReason(reason) ? reason : undefined, typeof note === "string" ? note : undefined);
}

const BAD_NOTE = { ok: false as const, message: `A note can be up to ${NOTE_LENGTH} characters.` };

/** An optional stop-loss and take-profit: numbers if given. Their levels are checked against the price later. */
function parseBracket(value: unknown): Bracket | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return null;
  const { stop, target } = value as Record<string, unknown>;
  if ((stop !== undefined && typeof stop !== "number") || (target !== undefined && typeof target !== "number")) return null;
  return stop === undefined && target === undefined ? undefined : { ...(stop !== undefined && { stop }), ...(target !== undefined && { target }) };
}

/** A market order's extras: selling short, and a bracket. */
export interface OrderOptions {
  short?: boolean;
  bracket?: Bracket;
}

export async function placeOrderAction(input: unknown, side: unknown, shares: unknown, journal?: unknown, options?: unknown): Promise<ActionResult> {
  if (typeof input !== "string" || (side !== "buy" && side !== "sell") || typeof shares !== "number") {
    return { ok: false, message: "That order isn't valid." };
  }
  const why = parseJournal(journal);
  if (!why) return BAD_NOTE;
  const extras = (typeof options === "object" && options !== null ? options : {}) as Record<string, unknown>;
  const short = side === "sell" && extras.short === true;
  const bracket = parseBracket(extras.bracket);
  if (bracket === null) return { ok: false, message: "That bracket isn't valid." };
  const owner = await currentOwner({ create: false });
  return forCurrentUser("book", async (userId) => {
    const detail = await getStockDetail(input);
    if (!detail) return UNKNOWN;
    if (detail.status === "unavailable") return { ok: false, message: `Prices for ${detail.listing.symbol} are unavailable right now. Try again in a minute.` };
    const { stock } = detail;
    const problem = bracketProblem(bracket, short, stock.price);
    if (problem) return { ok: false, message: problem };
    const id = crypto.randomUUID();
    const time = Date.now();
    // The same rules as guest mode (lib/trading.ts), inside a database transaction,
    // after bringing the account up to date (a dividend or a fill may have changed the cash).
    // A bracket's stop-loss and take-profit are placed in the same transaction as the fill.
    const result = await accounts.placeOrder(
      userId,
      { symbol: stock.symbol, side, shares, price: stock.price, id, time, ...(short && { short }), ...why },
      await processingDataFor(userId, [stock.symbol]),
      bracket ? (account) => ({ ...account, orders: [...bracketOrders({ id, symbol: stock.symbol, shares, short, bracket }, time), ...(account.orders ?? [])] }) : undefined,
    );
    if (result.ok && owner?.kind === "user") checkBadgesLater(owner.id); // a trade counts towards a streak
    return result.ok ? { ok: true, account: result.account } : { ok: false, message: result.message };
  });
}

export async function resetAccountAction(preset: unknown = "starter"): Promise<ActionResult> {
  if (!isStartingPreset(preset)) return { ok: false, message: "Choose one of the starting options." };
  const owner = await currentOwner({ create: false });
  if (await currentBook(owner)) return { ok: false, message: "A season portfolio can't be reset. Switch to your practice portfolio to start over." };
  return forCurrentUser("book", (userId) => accounts.reset(userId, preset));
}

/** Runs `change` on the up-to-date account in one transaction, and returns the account or the refusal. */
async function change(userId: string, extra: string[], fn: Parameters<typeof accounts.update>[2]): Promise<ActionResult> {
  const result = await accounts.update(userId, await processingDataFor(userId, extra), fn);
  return result.ok ? { ok: true, account: result.account } : result;
}

export async function placePendingOrderAction(input: unknown): Promise<ActionResult> {
  if (typeof input !== "object" || input === null) return { ok: false, message: "That order isn't valid." };
  const { symbol, side, type, shares, price, duration, reason, note, short, trail, bracket } = input as Record<string, unknown>;
  if (typeof symbol !== "string" || typeof shares !== "number" || typeof price !== "number") return { ok: false, message: "That order isn't valid." };
  const why = parseJournal({ reason, note });
  if (!why) return BAD_NOTE;
  const levels = parseBracket(bracket);
  if (levels === null) return { ok: false, message: "That bracket isn't valid." };
  const distance = typeof trail === "object" && trail !== null ? (trail as Trail) : undefined;
  return forCurrentUser("book", async (userId) => {
    const detail = await getStockDetail(symbol);
    if (!detail) return UNKNOWN;
    const listing = detail.status === "ok" ? detail.stock : detail.listing;
    // Each field is checked by placePendingOrder; a trailing stop starts from today's price.
    const order = {
      symbol: listing.symbol,
      side,
      type,
      shares,
      price,
      duration,
      ...(short === true && { short: true }),
      ...(distance && { trail: { kind: distance.kind, value: distance.value } }),
      ...(levels && { bracket: levels }),
      ...why,
    } as NewOrder;
    const marketPrice = detail.status === "ok" ? detail.stock.price : undefined;
    return change(userId, [listing.symbol], (account) => placePendingOrder(account, order, crypto.randomUUID(), Date.now(), marketPrice));
  });
}

/**
 * Buys or sells option contracts from the simulated chain, at its price at
 * the latest close plus or minus the half-spread (lib/option-trading.ts).
 * Season portfolios trade shares only.
 */
export async function placeOptionOrderAction(input: unknown): Promise<ActionResult> {
  if (typeof input !== "object" || input === null) return { ok: false, message: "That order isn't valid." };
  const { symbol, kind, strike, expiry, side, contracts } = input as Record<string, unknown>;
  if (typeof symbol !== "string" || (kind !== "call" && kind !== "put") || typeof strike !== "number" || typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    return { ok: false, message: "That option isn't valid." };
  }
  if ((side !== "buy" && side !== "sell") || typeof contracts !== "number") return { ok: false, message: "That order isn't valid." };
  const owner = await currentOwner({ create: false });
  if (await currentBook(owner)) return { ok: false, message: "Season portfolios trade shares only. Switch to your practice portfolio to trade options." };
  const real = await realSymbol(symbol);
  if (!real) return UNKNOWN;
  return forCurrentUser("book", async (userId) => {
    // A new position must be in today's chain; one already held can always be closed, at the chain's pricing.
    const chain = await getChain(real);
    if (!chain.ok) return { ok: false, message: chain.message };
    const listed = chain.chain.expiries.some((e) => e.expiry === expiry && e.strikes.some((s) => s.strike === strike));
    const held = (await accounts.load(userId))?.options?.some((o) => o.symbol === real && o.kind === kind && o.strike === strike && o.expiry === expiryTime(expiry));
    if (!listed && !held) return { ok: false, message: "That option isn't in today's chain. Reload the page to see the latest one." };
    const quoted = await contractPrice(real, kind, strike, expiry);
    if (!quoted.ok) return { ok: false, message: quoted.message };
    const mid = quoted.price;
    if (!(mid > 0) && side === "buy") return { ok: false, message: "That option has no price to trade at." };
    const market = await processingDataFor(userId, [real]);
    const result = await accounts.placeOptionOrder(
      userId,
      { symbol: real, contract: { kind, strike, expiry: expiryTime(expiry) }, side, contracts, price: tradePrice(mid, side), id: crypto.randomUUID(), time: Date.now(), asOf: market.latest },
      market,
    );
    if (!result.ok) return { ok: false, message: result.message };
    // Value the new position at once, rather than at what was paid until tonight.
    return { ok: true, account: (await refreshOptionMarks(userId, result.account)) ? ((await accounts.load(userId)) ?? result.account) : result.account };
  });
}

/** Adds, changes or clears the reason and note on one of the visitor's past trades. */
export async function annotateTradeAction(id: unknown, journal: unknown): Promise<ActionResult> {
  const why = parseJournal(journal);
  if (typeof id !== "string" || id.length > 64) return { ok: false, message: "That trade isn't valid." };
  if (!why) return BAD_NOTE;
  return forCurrentUser("book", (userId) => change(userId, [], (account) => ({ ok: true, account: annotateTrade(account, id, why.reason, why.note) })));
}

export async function cancelOrderAction(id: unknown): Promise<ActionResult> {
  if (typeof id !== "string") return { ok: false, message: "That order isn't valid." };
  return forCurrentUser("book", (userId) => change(userId, [], (account) => ({ ok: true, account: cancelPendingOrder(account, id, Date.now()) })));
}

export async function addAlertAction(input: unknown): Promise<ActionResult> {
  if (typeof input !== "object" || input === null) return { ok: false, message: "That alert isn't valid." };
  const { symbol, direction, price, condition } = input as Record<string, unknown>;
  if (typeof price !== "number" || (direction !== "above" && direction !== "below")) return { ok: false, message: "That alert isn't valid." };
  return forCurrentUser("own", async (userId) => {
    const real = await realSymbol(symbol);
    if (!real) return UNKNOWN;
    return change(userId, [real], (account) => addAlert(account, { symbol: real, direction, price, ...(condition !== undefined && { condition }) }, crypto.randomUUID(), Date.now()));
  });
}

export async function removeAlertAction(id: unknown): Promise<ActionResult> {
  if (typeof id !== "string") return { ok: false, message: "That alert isn't valid." };
  return forCurrentUser("own", (userId) => change(userId, [], (account) => ({ ok: true, account: removeAlert(account, id) })));
}

export async function markAlertsSeenAction(): Promise<ActionResult> {
  return forCurrentUser("own", (userId) => change(userId, [], (account) => ({ ok: true, account: markAlertsSeen(account) })));
}

/**
 * Brings in an account this browser kept in localStorage before accounts
 * moved to the database (guest mode used to live there). It's only taken if
 * the owner has no portfolio of their own yet (none, or the untouched
 * starting one), so it can never overwrite one.
 *
 * The data comes from the browser, so it's validated for shape, and every
 * stock it names must exist. Its numbers are taken as they are: they were
 * never checked by a server, and since the simulator has no shared rankings
 * built on them, editing them would only fool yourself. (The leaderboard
 * ranks the return since joining, from the server's own values.)
 */
export async function importBrowserAccountAction(browser: unknown): Promise<ActionResult> {
  const account = parseAccount(browser, isSymbolFormat);
  const unreadable: ActionResult = { ok: false, message: "That browser data couldn't be read." };
  if (!account || account.holdings.length > MAX_HOLDINGS || account.watchlist.length > MAX_WATCHLIST) return unreadable;
  const symbols = [
    ...new Set([...account.holdings, ...account.watchlist, ...account.trades, ...(account.orders ?? []), ...(account.alerts ?? [])].map((x) => (typeof x === "string" ? x : x.symbol))),
  ];
  if (symbols.length > MAX_IMPORT_SYMBOLS) return unreadable;
  const real = await Promise.all(symbols.map(realSymbol));
  if (real.some((s) => s === null)) return { ok: false, message: "Your browser data names a stock that doesn't exist, so it couldn't be imported." };
  return forCurrentUser("own", async (userId) => {
    // Fresh trade, order and alert IDs: they're unique across all users, and these came from the browser.
    const fresh = <T extends { id: string }>(items: T[] | undefined) => items?.map((x) => ({ ...x, id: crypto.randomUUID() }));
    const imported = await accounts.replaceIfUntouched(userId, { ...account, trades: fresh(account.trades) ?? [], orders: fresh(account.orders), alerts: fresh(account.alerts) });
    if (!imported) return { ok: false, message: "This account already has a portfolio, so nothing was imported." };
  });
}

/**
 * After signing in, when both this browser's guest and the account had a
 * portfolio of their own: keep the account's, or replace it with the
 * guest's. The guest is then gone either way.
 */
export async function resolveGuestPortfolioAction(choice: unknown): Promise<ActionResult> {
  if (choice !== "keep-account" && choice !== "use-guest") return { ok: false, message: "Choose one of the two portfolios." };
  const owner = await currentOwner({ create: false });
  if (owner?.kind !== "user") return { ok: false, message: "Your session has ended. Sign in again to continue." };
  if (owner.pendingGuest) {
    await guests.resolve(owner.pendingGuest, owner.id, choice);
    await clearGuestCookie();
  }
  return { ok: true, account: await accounts.ensure(owner.id) };
}
