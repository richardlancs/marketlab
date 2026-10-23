"use server";

/**
 * Server Actions for seasons (lib/seasons.ts) and badges. As everywhere, the
 * person comes from the session cookie, never an argument, and every
 * argument is validated. Only signed-in users can join a season or switch
 * to a season portfolio.
 */
import { updateTag } from "next/cache";
import { checkBadges } from "./badge-check";
import { BADGES, type BadgeKind } from "./badges";
import { bookOf, booksOf, bookView, currentBook, PRACTICE, setBookCookie, type BookInfo } from "./books";
import { leaderboard, seasons } from "./db";
import { checkDisplayName } from "./leaderboard";
import { currentOwner } from "./owner";
import { SEASON_TAG } from "./season-data";
import { canJoin, isSeasonId, seasonIdOf } from "./seasons";
import type { Account } from "./trading";

export interface SeasonStatus {
  signedIn: boolean;
  /** Joining is open now, for this season. */
  canJoin: boolean;
  entry: { displayName: string; nameKey: string; joinedAt: number } | null;
  /** The name to offer: their leaderboard name, if they have one. */
  suggestedName: string;
  /** Their trading is currently in this season's portfolio. */
  trading: boolean;
}

/** Joining is open: the season's first week (or any day, in the end-to-end tests, which can't choose the date). */
const joinOpen = (id: string, now: number) => id === seasonIdOf(now) && (canJoin(id, now) || process.env.SEASON_JOIN_ANY_DAY === "1");

async function signedIn() {
  const owner = await currentOwner({ create: false });
  return owner?.kind === "user" ? owner : null;
}

export async function seasonStatusAction(id: unknown): Promise<SeasonStatus | null> {
  if (!isSeasonId(id)) return null;
  const owner = await signedIn();
  const open = joinOpen(id, Date.now());
  if (!owner) return { signedIn: false, canJoin: open, entry: null, suggestedName: "", trading: false };
  const [entry, board, book] = await Promise.all([seasons.entryOf(owner.id, id), leaderboard.get(owner.id), currentBook(owner)]);
  return {
    signedIn: true,
    canJoin: open && !entry,
    entry: entry && { displayName: entry.displayName, nameKey: entry.displayName.toLocaleLowerCase("en-US"), joinedAt: entry.joinedAt },
    suggestedName: board?.displayName ?? "",
    trading: !!entry && book?.accountId === entry.accountId,
  };
}

/** `book`: the new season portfolio's id, to switch to (it's the caller's own). */
export type JoinResult = { ok: true; book: string } | { ok: false; message: string };

/** Joins this month's season with a fresh $100,000 portfolio, and switches trading to it. */
export async function joinSeasonAction(id: unknown, name: unknown): Promise<JoinResult> {
  const owner = await signedIn();
  if (!owner) return { ok: false, message: "Sign in to join a season." };
  const now = Date.now();
  if (!isSeasonId(id) || !joinOpen(id, now)) return { ok: false, message: "Joining this season has closed. The next one opens on the 1st." };
  const checked = checkDisplayName(name);
  if (!checked.ok) return checked;
  const result = await seasons.join(owner.id, id, { displayName: checked.name, nameKey: checked.key }, now);
  if (result.status === "taken") return { ok: false, message: "That display name is taken in this season. Try another." };
  await setBookCookie(result.accountId!);
  updateTag(SEASON_TAG); // the new entrant shows straight away
  return { ok: true, book: result.accountId! };
}

export type BookResult = { ok: true; account: Account; book: BookInfo; books: BookInfo[] } | { ok: false; message: string };

/** Switches trading to a book: null for the practice portfolio, or one of the user's season portfolios. */
export async function chooseBookAction(accountId: unknown): Promise<BookResult> {
  if (accountId !== null && typeof accountId !== "string") return { ok: false, message: "Choose one of your portfolios." };
  const owner = await currentOwner({ create: false });
  if (!owner) return { ok: false, message: "Your account is still loading. Try again in a moment." };
  const entry = accountId === null || owner.kind !== "user" ? null : await seasons.entryByAccount(owner.id, accountId);
  if (accountId !== null && !entry) return { ok: false, message: "That portfolio isn't yours." };
  await setBookCookie(entry ? entry.accountId : null);
  return { ok: true, account: await bookView(owner.id, entry), book: entry ? bookOf(entry) : PRACTICE, books: await booksOf(owner) };
}

/** The signed-in user's value at each close of a season, for their line on the race chart. */
export async function myRaceAction(id: unknown): Promise<{ displayName: string; points: { time: number; value: number }[] } | null> {
  if (!isSeasonId(id)) return null;
  const owner = await signedIn();
  const entry = owner && (await seasons.entryOf(owner.id, id));
  if (!entry) return null;
  return { displayName: entry.displayName, points: (await seasons.history(id, [entry.accountId])).get(entry.accountId) ?? [] };
}

export interface MyBadge {
  kind: BadgeKind;
  label: string;
  detail: string;
  icon: string;
  scope: string;
  earnedAt: number;
}

/** The signed-in user's badges, after checking for any newly earned. */
export async function myBadgesAction(): Promise<MyBadge[] | null> {
  const owner = await signedIn();
  if (!owner) return null;
  await checkBadges(owner.id);
  return (await seasons.badgesOf(owner.id)).map((b) => ({ ...b, ...BADGES[b.kind] }));
}
