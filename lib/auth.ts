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
import * as schema from "./db/schema";

export const auth = betterAuth({
  // BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment
  // (.env.local in development; see .env.example).
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Sign the user in straight after sign-up. There's no email sending yet,
    // so addresses aren't verified; that would be a later addition.
    autoSignIn: true,
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
    },
  },
  // Lets Server Actions set auth cookies. Must be the last plugin.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
