/**
 * Sign-in for MarketLab, with Better Auth: email + password accounts, stored
 * in our database through the Drizzle adapter. Server-only: it holds the
 * secret that signs session cookies.
 *
 * Better Auth handles the security-sensitive parts: password hashing,
 * session tokens in httpOnly cookies, CSRF checks and rate limiting.
 */
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { emailEnabled, sendEmail, verificationEmail } from "./email";
import * as schema from "./db/schema";

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
