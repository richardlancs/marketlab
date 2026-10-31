/**
 * Sign-in for MarketLab, with Better Auth: email + password accounts and,
 * where it's set up, Google, stored in our database through the Drizzle
 * adapter. Server-only: it holds the
 * secret that signs session cookies.
 *
 * Better Auth handles the security-sensitive parts: password hashing,
 * session tokens in httpOnly cookies, CSRF checks and rate limiting.
 */
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, personalData } from "./db";
import { accountDeletedEmail, changeEmailConfirmation, emailEnabled, sendEmail, verificationEmail } from "./email";
import * as schema from "./db/schema";
import { isOwnAvatar } from "./profile";

/**
 * The hosts sign-in may be used from, e.g. "marketlab.example.com" and a
 * pattern for this project's Vercel preview URLs. Unset locally, where the
 * single BETTER_AUTH_URL is enough. Never "*.vercel.app": that would trust
 * every site on Vercel, not just this one's previews.
 */
const allowedHosts = (process.env.BETTER_AUTH_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

/**
 * Whether "Continue with Google" is offered: only once the OAuth client from
 * Google Cloud Console is configured (see docs/deploying.md).
 */
export function googleEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export const auth = betterAuth({
  // BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment
  // (.env.local in development; see .env.example). With allowed hosts set,
  // the base URL follows the request's host if it's one of them (so each
  // Vercel preview URL can sign in), and BETTER_AUTH_URL is the fallback.
  ...(allowedHosts.length > 0 && {
    baseURL: { allowedHosts, fallback: process.env.BETTER_AUTH_URL, protocol: "https" as const },
  }),
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Signed in straight after sign-up, verified or not: requiring it would
    // lock out every account made before verification existed. Verified
    // addresses (user.emailVerified) are what email features rely on.
    autoSignIn: true,
  },
  // Sign in with Google. A Google sign-in whose email matches an existing
  // account joins that account, but only if the account's address is verified
  // (Better Auth's default): otherwise anyone could sign up with someone
  // else's address and later receive their Google sign-in.
  ...(googleEnabled() && {
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        // Always ask which Google account, so a shared computer doesn't sign in as whoever used it last.
        prompt: "select_account" as const,
      },
    },
  }),
  // Verifying email addresses: a link sent on sign-up (and on request from
  // the banner, components/account/verify-email-notice.tsx), valid for a day.
  // Only where email can be sent (lib/email.ts): otherwise nothing promises
  // an email that never comes.
  ...(emailEnabled() && {
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      async sendVerificationEmail({ user, url }) {
        await sendEmail(verificationEmail(user.email, user.name, url));
      },
    },
  }),
  user: {
    // Changing the address: from the account page (lib/profile-actions.ts,
    // which asks for the password first). An address that was never confirmed
    // changes at once, and the new one gets a confirmation link; a confirmed
    // one changes only after a link sent to the *old* address is opened, then
    // one sent to the new address, so whoever holds a session can't move the
    // account to an address of theirs without the owner's inbox.
    ...(emailEnabled() && {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: true,
        async sendChangeEmailConfirmation({ user, newEmail, url }) {
          await sendEmail(changeEmailConfirmation(user.email, user.name, newEmail, url));
        },
      },
    }),
    // Deleting the account: also only from the account page's action, which
    // checks the password (or a fresh Google sign-in). All MarketLab data goes
    // first; Better Auth then deletes the user, its sessions and sign-in methods.
    deleteUser: {
      enabled: true,
      async beforeDelete(user) {
        await personalData.eraseEverything(user.id);
      },
      async afterDelete(user) {
        // A heads-up, so someone whose account was deleted by somebody else finds out. Never blocks the deletion.
        if (emailEnabled() && user.emailVerified) await sendEmail(accountDeletedEmail(user.email, user.name)).catch((error) => console.error("[auth] couldn't send the deletion email:", error));
      },
    },
  },
  // Better Auth's own endpoints for these are switched off: the Server
  // Actions in lib/profile-actions.ts call them on the server after their own
  // checks (a password, the name rules, a picture we serve ourselves). Calls
  // from the server (auth.api) aren't affected by this list.
  disabledPaths: ["/update-user", "/change-email", "/delete-user", "/delete-user/callback"],
  databaseHooks: {
    user: {
      // Google sign-in would store the Google account's photo address. It's
      // never shown (the page only loads pictures from this site), so it isn't kept.
      create: {
        async before(user) {
          return { data: { ...user, image: null } };
        },
      },
      update: {
        async before(user) {
          if (user.image != null && !isOwnAvatar(user.image)) return { data: { ...user, image: undefined } };
        },
      },
    },
  },
  rateLimit: {
    // On in development too, so it can be tested. Stored in the database,
    // because online each server instance has its own memory.
    enabled: true,
    storage: "database",
    customRules: {
      // Slow down password guessing: 5 sign-in attempts a minute per IP.
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      // Each one sends an email: a couple a minute is plenty.
      "/send-verification-email": { window: 60, max: 2 },
    },
  },
  // Lets Server Actions set auth cookies. Must be the last plugin.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
