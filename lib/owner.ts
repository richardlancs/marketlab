/**
 * Whose data a request is about: the signed-in user, or this browser's guest.
 * Server-only (it reads the session and sets cookies), so it's used from
 * Server Actions and Route Handlers.
 *
 * - Signed in: their account. If the browser still has a guest cookie (they
 *   used MarketLab as a guest, then signed in), the guest's data is handed
 *   over first (lib/db/guests.ts). If both had a portfolio of their own,
 *   the guest is kept until they choose, and `pendingGuest` says so.
 * - Signed out: the guest in the cookie. A new guest is created only when
 *   there's something to save (`create`), so visitors who only look around
 *   don't each create one.
 *
 * The guest cookie holds only a random ID, is httpOnly (page scripts can't
 * read it), and lasts 400 days, the most browsers allow. Being a guest never
 * makes anyone "signed in": guests have no session.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { auth } from "./auth";
import { guests } from "./db";

export const GUEST_COOKIE = "marketlab_guest";
/** Phase 10's cookie for anonymous lesson progress, from before guests were users. Upgraded on sight. */
const LEARNER_COOKIE = "marketlab_learner";
const MAX_AGE = 400 * 24 * 60 * 60;
const DAY = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Owner {
  id: string;
  kind: "user" | "guest";
  /** Signed in with a guest portfolio still waiting for the keep-or-replace choice: the guest's ID. */
  pendingGuest: string | null;
}

async function cookieValue(name: string): Promise<string | null> {
  const value = (await cookies()).get(name)?.value;
  return value && UUID.test(value) ? value : null;
}

async function setGuestCookie(id: string) {
  (await cookies()).set(GUEST_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}

/** Forgets this browser's guest (after its data has gone to an account). */
export async function clearGuestCookie() {
  (await cookies()).delete(GUEST_COOKIE);
}

async function signedInUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * The owner of this request's data. With `create`, a visitor without a guest
 * gets one (and its cookie); without it, they get null.
 */
export async function currentOwner({ create }: { create: boolean }): Promise<Owner | null> {
  const now = Date.now();
  const jar = await cookies();
  const [userId, guestId, learnerId] = await Promise.all([signedInUserId(), cookieValue(GUEST_COOKIE), cookieValue(LEARNER_COOKIE)]);
  const guestActive = guestId ? await guests.lastActive(guestId) : null;
  const guest = guestActive === null ? null : guestId;
  // A cookie for a guest that no longer exists (cleaned up, or never real) is dropped.
  if (guestId && !guest) jar.delete(GUEST_COOKIE);

  if (userId) {
    if (learnerId) {
      await guests.adoptLearner(learnerId, userId, now);
      jar.delete(LEARNER_COOKIE);
    }
    if (!guest) return { id: userId, kind: "user", pendingGuest: null };
    const { conflict } = await guests.handover(guest, userId, now);
    if (conflict) return { id: userId, kind: "user", pendingGuest: guest };
    jar.delete(GUEST_COOKIE);
    return { id: userId, kind: "user", pendingGuest: null };
  }

  let id = guest;
  // Phase 10 lesson progress without a guest yet: worth a guest to keep it.
  if (!id && (create || learnerId)) {
    id = await guests.create(now);
    await setGuestCookie(id);
  }
  if (!id) return null;
  if (learnerId) {
    await guests.adoptLearner(learnerId, id, now);
    jar.delete(LEARNER_COOKIE);
  }
  // Keeps an active guest from the cleanup, with at most one write a day.
  if (guestActive !== null && now - guestActive > DAY) await guests.touch(id, now);
  return { id, kind: "guest", pendingGuest: null };
}
