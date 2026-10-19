import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit settings: where the schema is, and where migration files go.
 * DATABASE_URL is a local file in development (the default below) and a
 * Turso URL in production; Turso speaks the same SQLite dialect, so the same
 * migrations apply to both.
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
