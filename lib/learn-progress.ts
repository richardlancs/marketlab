/**
 * Who a lesson-progress request belongs to: the signed-in user, or a guest
 * known by an anonymous learner cookie. Server-only (it reads the session and
 * sets cookies), used by lib/learn-actions.ts and /api/learn-progress.
 *
 * - Signed in: their account's progress. If the request also carries a guest
 *   cookie (they were a guest in this browser, then signed in), the guest's
 *   progress is merged into the account first and the cookie removed.
 * - Guest: the learner in the cookie. A new one is created only when there's
 *   something to save (the first answer), so visitors who just read the
 *   lessons don't each create a row.
 *
 * The cookie holds only a random ID (no personal data), is httpOnly so page
 * scripts can't read it, and lasts 400 days, the most browsers allow.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { auth } from "./auth";
import { learning } from "./db";
import type { ProgressMap } from "./lessons/progress";

export const LEARNER_COOKIE = "marketlab_learner";
const MAX_AGE = 400 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Learner = { userId: string } | { guestId: string };
/** Where progress is saved, for the "Saved to …" label. */
export type ProgressStorage = "account" | "guest";

async function guestCookie(): Promise<string | null> {
  const value = (await cookies()).get(LEARNER_COOKIE)?.value;
  return value && UUID.test(value) ? value : null;
}

async function setGuestCookie(id: string) {
  (await cookies()).set(LEARNER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

const clearGuestCookie = async () => (await cookies()).delete(LEARNER_COOKIE);

async function signedInUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * The learner for this request, merging a leftover guest into a signed-in
 * user. With `create`, a guest without a (valid) cookie gets a new learner
 * and cookie; without it, they get null.
 */
export async function currentLearner({ create }: { create: boolean }): Promise<Learner | null> {
  const now = Date.now();
  const [userId, guestId] = await Promise.all([signedInUserId(), guestCookie()]);
  if (userId) {
    if (guestId) {
      await learning.mergeGuestIntoUser(guestId, userId, now);
      await clearGuestCookie();
    }
    return { userId };
  }
  if (guestId && (await learning.loadGuest(guestId))) return { guestId };
  if (!create) return null;
  const id = await learning.createGuest(now);
  await setGuestCookie(id);
  return { guestId: id };
}

/** This request's progress, and where it's saved. Nothing is created for a visitor with no progress yet. */
export async function currentProgress(): Promise<{ progress: ProgressMap; storage: ProgressStorage }> {
  const learner = await currentLearner({ create: false });
  if (!learner) {
    // A cookie for a learner that no longer exists is just removed.
    if (await guestCookie()) await clearGuestCookie();
    return { progress: {}, storage: "guest" };
  }
  if ("userId" in learner) return { progress: await learning.loadForUser(learner.userId), storage: "account" };
  return { progress: (await learning.loadGuest(learner.guestId)) ?? {}, storage: "guest" };
}
