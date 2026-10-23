/**
 * Which portfolio a request trades in: the person's own practice portfolio,
 * or one of their season portfolios (lib/seasons.ts), chosen with a cookie.
 *
 * The person stays `currentOwner` (lib/owner.ts) for everything else: saved
 * backtests, lessons, notifications, the leaderboard. Only trading, orders
 * and the portfolio views follow the chosen book. The watchlist and alerts
 * are personal, so a season book is shown with the owner's own.
 *
 * The cookie only names an account; it's honoured only if the signed-in
 * user owns that season entry, so it can't open anyone else's.
 */
import "server-only";
import { cookies } from "next/headers";
import { accounts, seasons } from "./db";
import type { EntryRow } from "./db/seasons";
import type { Owner } from "./owner";
import { seasonLabel } from "./seasons";
import type { Account } from "./trading";

export const BOOK_COOKIE = "marketlab_book";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A book as the browser sees it. `id` is null for the practice portfolio. */
export interface BookInfo {
  id: string | null;
  label: string;
  seasonId: string | null;
  /** A finished season's portfolio: shown, not traded. */
  readOnly: boolean;
}

export const PRACTICE: BookInfo = { id: null, label: "Practice portfolio", seasonId: null, readOnly: false };

export const bookOf = (entry: EntryRow): BookInfo => ({
  id: entry.accountId,
  label: `${seasonLabel(entry.seasonId, { short: true })} season`,
  seasonId: entry.seasonId,
  readOnly: entry.closedAt !== null,
});

/** The season entry this request trades in, or null for the practice portfolio. Only signed-in users have season books. */
export async function currentBook(owner: Owner | null): Promise<EntryRow | null> {
  if (owner?.kind !== "user") return null;
  const id = (await cookies()).get(BOOK_COOKIE)?.value;
  if (!id || !UUID.test(id)) return null;
  return seasons.entryByAccount(owner.id, id);
}

export async function setBookCookie(accountId: string | null) {
  const jar = await cookies();
  if (accountId === null) jar.delete(BOOK_COOKIE);
  else jar.set(BOOK_COOKIE, accountId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 86_400 });
}

/** The books the owner can switch between: practice, and their seasons (newest first). */
export async function booksOf(owner: Owner | null): Promise<BookInfo[]> {
  if (owner?.kind !== "user") return [PRACTICE];
  return [PRACTICE, ...(await seasons.entriesOf(owner.id, 6)).map(bookOf)];
}

/**
 * The account to show for a book: a season portfolio with the owner's own
 * watchlist and alerts. `known` saves a read when an action has just
 * returned one of the two accounts.
 */
export async function bookView(ownerId: string, book: EntryRow | null, known?: { id: string; account: Account }): Promise<Account> {
  const read = async (id: string, create: boolean) => (known?.id === id ? known.account : create ? accounts.ensure(id) : ((await accounts.load(id)) ?? accounts.ensure(id)));
  const own = await read(ownerId, true);
  if (!book) return own;
  const portfolio = await read(book.accountId, false);
  return { ...portfolio, watchlist: own.watchlist, alerts: own.alerts };
}
