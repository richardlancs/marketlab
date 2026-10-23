import { accounts, guests } from "@/lib/db";
import { bookOf, booksOf, bookView, currentBook, PRACTICE } from "@/lib/books";
import { currentOwner } from "@/lib/owner";
import { visitorAccount } from "@/lib/visitor-account";

/**
 * GET /api/account: this visitor's simulated account, signed in or a guest
 * (lib/owner.ts), as JSON. Changes go through the Server Actions in
 * lib/account-actions.ts.
 *
 * - `owner` is "user" or "guest".
 * - A visitor who has saved nothing gets the starting account, unsaved: a
 *   guest is created only on their first change.
 * - A signed-in user's account is set up on first sight, as it always was.
 * - `book` is the portfolio being traded in (lib/books.ts): practice, or a
 *   season's, shown with the owner's own watchlist and alerts; `books` lists
 *   the ones they can switch to.
 * - `pending` is this browser's guest portfolio when signing in found one
 *   alongside the account's own: the browser asks which to keep.
 */
export async function GET() {
  const owner = await currentOwner({ create: false });
  const book = await currentBook(owner);
  const body = !owner
    ? { owner: "guest", account: await visitorAccount(), pending: null, book: PRACTICE, books: [PRACTICE] }
    : {
        owner: owner.kind,
        account: owner.kind === "user" ? await bookView(owner.id, book) : ((await accounts.load(owner.id)) ?? (await visitorAccount())),
        pending: owner.pendingGuest ? await guests.pending(owner.pendingGuest) : null,
        book: book ? bookOf(book) : PRACTICE,
        books: await booksOf(owner),
      };
  // Private, per-visitor data: never stored by a browser or CDN cache.
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
