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
import { getStock, STOCK_SYMBOLS } from "./mock-data";
import { parseAccount, type Account } from "./trading";

/** What the browser gets back: the account after the change, or a message to show. */
export type ActionResult = { ok: true; account: Account } | { ok: false; message: string };

const SIGNED_OUT: ActionResult = { ok: false, message: "Your session has ended. Sign in again to continue." };
const isSymbol = (value: unknown): value is string => typeof value === "string" && STOCK_SYMBOLS.includes(value);

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

export async function toggleWatchlistAction(symbol: unknown): Promise<ActionResult> {
  if (!isSymbol(symbol)) return { ok: false, message: "Unknown stock." };
  return forCurrentUser(async (userId) => {
    await accounts.toggleWatchlist(userId, symbol);
  });
}

export async function placeOrderAction(symbol: unknown, side: unknown, shares: unknown): Promise<ActionResult> {
  if (!isSymbol(symbol) || (side !== "buy" && side !== "sell") || typeof shares !== "number") {
    return { ok: false, message: "That order isn't valid." };
  }
  return forCurrentUser(async (userId) => {
    const stock = await getStock(symbol);
    if (!stock) return { ok: false, message: "Unknown stock." };
    // The same rules as guest mode (lib/trading.ts), inside a database transaction.
    const result = await accounts.placeOrder(userId, {
      symbol,
      side,
      shares,
      price: stock.price,
      id: crypto.randomUUID(),
      time: Date.now(),
    });
    return result.ok ? { ok: true, account: result.account } : { ok: false, message: result.message };
  });
}

export async function resetAccountAction(): Promise<ActionResult> {
  return forCurrentUser((userId) => accounts.reset(userId));
}

/** Sets the account up from the starting account (the user chose not to import, or had nothing to import). */
export async function startFreshAction(): Promise<ActionResult> {
  return forCurrentUser(async () => {}); // forCurrentUser's ensure() creates it
}

/**
 * Copies a guest account from this browser into the user's new account.
 * Only allowed while they have no account yet, so it can't overwrite one.
 *
 * The guest data comes from the browser, so it's validated for shape and
 * known symbols. Its numbers are taken as they are: guest mode never had a
 * server checking it, and since the simulator has no shared rankings, editing
 * them would only fool yourself.
 */
export async function importGuestAccountAction(guest: unknown): Promise<ActionResult> {
  const account = parseAccount(guest, STOCK_SYMBOLS);
  if (!account) return { ok: false, message: "That browser data couldn't be read." };
  return forCurrentUser(async (userId) => {
    // Fresh trade IDs: IDs are unique across all users, and these came from the browser.
    const trades = account.trades.map((t) => ({ ...t, id: crypto.randomUUID() }));
    const created = await accounts.create(userId, { ...account, trades });
    if (!created) return { ok: false, message: "Your account already has data, so nothing was imported." };
  });
}
