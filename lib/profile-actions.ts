"use server";

/**
 * Server Actions behind the account page (app/account): the profile (name,
 * picture, email address), erasing data, and deleting the account.
 *
 * Like lib/account-actions.ts, each one is a public endpoint, so it reads
 * whose account it is from the session (or the guest cookie), never from an
 * argument, and checks every argument itself. Better Auth's own endpoints for
 * these are switched off (disabledPaths in lib/auth.ts), so these checks are
 * the only way in:
 * - changing the email address or deleting the account needs the password,
 *   or for an account without one (Google only), a sign-in in the last
 *   few minutes;
 * - a picture is accepted only as a small WebP, JPEG or PNG, by its bytes.
 */
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { auth } from "./auth";
import { BOOK_COOKIE } from "./books";
import { checkBadges } from "./badge-check";
import { BADGES, type BadgeKind } from "./badges";
import { learning, personalData, seasons } from "./db";
import { getStandings } from "./leaderboard-data";
import { LESSONS } from "./lessons";
import { passedTerms } from "./lessons/progress";
import { emailEnabled } from "./email";
import { clearGuestCookie, currentOwner } from "./owner";
import { AVATAR_BYTES, avatarUrl, cleanName, GUEST_DATA_KINDS, isDeletePhrase, NAME_LENGTH, parseDataKinds, RECENT_SIGN_IN, sniffImage } from "./profile";
import { allow } from "./rate-limit";

export type ProfileResult = { ok: true } | { ok: false; message: string; signInAgain?: boolean };

/** What the account page needs to know to show the right options. */
export type AccountSettings =
  | { kind: "none" }
  | { kind: "guest" }
  | { kind: "user"; hasPassword: boolean; google: boolean; emailChange: boolean; signedInAt: number };

type ProfileStats = NonNullable<Awaited<ReturnType<typeof personalData.profileStats>>>;

/** Everything the profile page (app/profile) shows besides the portfolio, which the page values itself from the account. */
export type ProfileOverview =
  | { kind: "none" }
  | {
      kind: "user" | "guest";
      stats: ProfileStats;
      lessons: { passed: number; total: number };
      badges: { kind: BadgeKind; label: string; detail: string; icon: string; scope: string; earnedAt: number }[];
      /** Their place on the all-time leaderboard, if they're on it. */
      standing: { rank: number; of: number; returnSinceJoining: number } | null;
    };

const NOT_SIGNED_IN: ProfileResult = { ok: false, message: "You're signed out. Sign in again, then try again." };
const TOO_MANY: ProfileResult = { ok: false, message: "Too many attempts. Wait a minute, then try again." };
const FAILED: ProfileResult = { ok: false, message: "Something went wrong. Reload the page and try again." };

async function currentSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Whether the request proves it's the account's owner: the right password, or (without one) a recent sign-in. */
async function confirmOwner(userId: string, signedInAt: number, password: unknown): Promise<ProfileResult> {
  if (await personalData.hasPassword(userId)) {
    if (typeof password !== "string" || !password) return { ok: false, message: "Enter your password." };
    if (password.length > 128) return { ok: false, message: "That password isn't right." };
    try {
      await auth.api.verifyPassword({ body: { password }, headers: await headers() });
    } catch (error) {
      if (isAPIError(error)) return { ok: false, message: "That password isn't right." };
      throw error;
    }
    return { ok: true };
  }
  if (Date.now() - signedInAt > RECENT_SIGN_IN) {
    return { ok: false, signInAgain: true, message: "To keep your account safe, sign in with Google again first. Then come back here within 10 minutes." };
  }
  return { ok: true };
}

export async function accountSettingsAction(): Promise<AccountSettings> {
  const session = await currentSession();
  if (!session) return (await currentOwner({ create: false })) ? { kind: "guest" } : { kind: "none" };
  const methods = await personalData.signInMethods(session.user.id);
  return {
    kind: "user",
    hasPassword: methods.includes("credential"),
    google: methods.includes("google"),
    emailChange: emailEnabled(),
    signedInAt: new Date(session.session.createdAt).getTime(),
  };
}

export async function profileOverviewAction(): Promise<ProfileOverview> {
  const owner = await currentOwner({ create: false });
  if (!owner) return { kind: "none" };
  // Lesson and streak badges earned since the last check appear straight away.
  await checkBadges(owner.id).catch(() => {});
  const [stats, progress, earned] = await Promise.all([personalData.profileStats(owner.id), learning.load(owner.id), seasons.badgesOf(owner.id)]);
  if (!stats) return { kind: "none" };
  let standing: { rank: number; of: number; returnSinceJoining: number } | null = null;
  if (stats.leaderboard) {
    // The board is cached for a few minutes; a member who only just joined may not be on it yet.
    const board = await getStandings().catch(() => []);
    const mine = board.find((row) => row.displayName === stats.leaderboard!.displayName);
    if (mine) standing = { rank: mine.rank, of: board.length, returnSinceJoining: mine.returnSinceJoining };
  }
  const lessons = Object.keys(LESSONS);
  return {
    kind: owner.kind,
    stats,
    lessons: { passed: passedTerms(progress).filter((term) => lessons.includes(term)).length, total: lessons.length },
    badges: earned.map((b) => ({ ...b, ...BADGES[b.kind] })),
    standing,
  };
}

export async function updateNameAction(input: unknown): Promise<ProfileResult> {
  const name = cleanName(input);
  if (!name) return { ok: false, message: `Enter a name of up to ${NAME_LENGTH} characters.` };
  if (!(await allow("profile", 20, 60))) return TOO_MANY;
  const session = await currentSession();
  if (!session) return NOT_SIGNED_IN;
  await auth.api.updateUser({ body: { name }, headers: await headers() });
  return { ok: true };
}

/** Saves a new profile picture, sent as `avatar` in form data (the browser has already cropped and shrunk it). */
export async function uploadAvatarAction(form: unknown): Promise<ProfileResult> {
  if (!(form instanceof FormData)) return FAILED;
  const file = form.get("avatar");
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, message: "Choose a picture." };
  if (file.size > AVATAR_BYTES) return { ok: false, message: "That picture is too big. Try a different one." };
  if (!(await allow("avatar", 10, 60))) return TOO_MANY;
  const session = await currentSession();
  if (!session) return NOT_SIGNED_IN;
  const data = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(data);
  if (!type) return { ok: false, message: "Use a JPEG, PNG or WebP picture." };
  const version = createHash("sha256").update(data).digest("hex").slice(0, 16);
  await personalData.setAvatar(session.user.id, type, data, version, avatarUrl(version), Date.now());
  return { ok: true };
}

export async function removeAvatarAction(): Promise<ProfileResult> {
  const session = await currentSession();
  if (!session) return NOT_SIGNED_IN;
  await personalData.erase(session.user.id, ["picture"]);
  return { ok: true };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Starts changing the account's email address (see changeEmail in
 * lib/auth.ts for the links that follow). `status` says where the next link
 * went, for the page to tell the person.
 */
export async function changeEmailAction(newEmail: unknown, password: unknown): Promise<ProfileResult & { sentTo?: "old" | "new" }> {
  if (!emailEnabled()) return { ok: false, message: "Changing your email isn't available on this site." };
  const email = typeof newEmail === "string" ? newEmail.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, message: "Enter a valid email address." };
  if (email.endsWith("@guest.invalid")) return { ok: false, message: "Enter a valid email address." };
  if (!(await allow("change-email", 5, 60))) return TOO_MANY;
  const session = await currentSession();
  if (!session) return NOT_SIGNED_IN;
  if (email === session.user.email.toLowerCase()) return { ok: false, message: "That's already your email address." };
  const confirmed = await confirmOwner(session.user.id, new Date(session.session.createdAt).getTime(), password);
  if (!confirmed.ok) return confirmed;
  try {
    // An address already used by another account gets the same answer (Better Auth sends nothing), so this can't be used to find out who has an account.
    await auth.api.changeEmail({ body: { newEmail: email, callbackURL: "/account?email=changed" }, headers: await headers() });
  } catch (error) {
    if (isAPIError(error)) return FAILED;
    throw error;
  }
  return { ok: true, sentTo: session.user.emailVerified ? "old" : "new" };
}

/** Erases the chosen kinds of data (lib/profile.ts DATA_KINDS), keeping the account. Works for guests too. */
export async function eraseDataAction(input: unknown): Promise<ProfileResult> {
  const kinds = parseDataKinds(input);
  if (!kinds) return { ok: false, message: "Choose what to erase." };
  if (!(await allow("erase", 10, 60))) return TOO_MANY;
  const owner = await currentOwner({ create: false });
  if (!owner) return { ok: true }; // nothing saved yet, so nothing to erase
  const allowed = owner.kind === "user" ? kinds : kinds.filter((k) => GUEST_DATA_KINDS.includes(k));
  await personalData.erase(owner.id, allowed);
  if (allowed.includes("community")) (await cookies()).delete(BOOK_COOKIE);
  return { ok: true };
}

/** Deletes this browser's guest and everything it saved, and forgets its cookie. */
export async function deleteGuestAction(): Promise<ProfileResult> {
  const owner = await currentOwner({ create: false });
  if (owner?.kind !== "guest") return owner ? { ok: false, message: "You're signed in: delete your account instead." } : { ok: true };
  await personalData.deleteGuest(owner.id);
  await clearGuestCookie();
  return { ok: true };
}

/**
 * Deletes the signed-in account and all its data, for good. Needs the
 * confirmation phrase, and the password (or a recent Google sign-in).
 */
export async function deleteAccountAction(phrase: unknown, password: unknown): Promise<ProfileResult> {
  if (!isDeletePhrase(phrase)) return { ok: false, message: "Type the words exactly as shown to confirm." };
  if (!(await allow("delete-account", 5, 60))) return TOO_MANY;
  const session = await currentSession();
  if (!session) return NOT_SIGNED_IN;
  const confirmed = await confirmOwner(session.user.id, new Date(session.session.createdAt).getTime(), password);
  if (!confirmed.ok) return confirmed;
  try {
    // With the password, Better Auth checks it again; without one, it checks the session is recent (within a day; ours is stricter, above).
    await auth.api.deleteUser({ body: typeof password === "string" && password ? { password } : {}, headers: await headers() });
  } catch (error) {
    if (isAPIError(error)) return { ok: false, signInAgain: true, message: "Couldn't confirm it's you. Sign out, sign in again, then try again." };
    throw error;
  }
  const jar = await cookies();
  jar.delete(BOOK_COOKIE);
  return { ok: true };
}
