/**
 * The database tables, defined with Drizzle. `npm run db:generate` turns
 * changes here into SQL migration files in drizzle/, and `npm run db:migrate`
 * applies them.
 *
 * Column names are snake_case in the database and camelCase in TypeScript.
 * Times are integers (Unix milliseconds); money is a REAL, the same 64-bit
 * float JavaScript uses, and lib/trading.ts rounds cash to cents.
 */
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Better Auth's tables. Generated from Better Auth's own schema generator
// (for email + password sign-in, with rate limits stored in the database),
// so the names and types match what it expects.
// ---------------------------------------------------------------------------

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull();

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    /** A hash, never the password itself. */
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

// ---------------------------------------------------------------------------
// MarketLab's tables: each user's simulated account. Every row belongs to one
// user and is deleted with them (onDelete: "cascade").
// ---------------------------------------------------------------------------

const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

/**
 * One row per user once their simulated account exists. Its absence means the
 * user hasn't set one up yet (they're offered a guest import first).
 */
export const portfolio = sqliteTable("portfolio", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  cash: real("cash").notNull(),
  createdAt: createdAt(),
  /** The last close the account was brought up to date with (lib/processing.ts). Null until the first time. */
  processedThrough: integer("processed_through"),
});

export const holding = sqliteTable(
  "holding",
  {
    userId: userId(),
    symbol: text("symbol").notNull(),
    shares: integer("shares").notNull(),
    averageCost: real("average_cost").notNull(),
  },
  // One row per user and symbol.
  (table) => [primaryKey({ columns: [table.userId, table.symbol] })],
);

export const watchlistItem = sqliteTable(
  "watchlist_item",
  {
    userId: userId(),
    symbol: text("symbol").notNull(),
    /** Keeps the watchlist in the order symbols were added. */
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.symbol] })],
);

export const trade = sqliteTable(
  "trade",
  {
    id: text("id").primaryKey(),
    userId: userId(),
    symbol: text("symbol").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    shares: integer("shares").notNull(),
    price: real("price").notNull(),
    time: integer("time").notNull(),
    realizedGain: real("realized_gain"),
  },
  // Trade history is always read per user, newest first.
  (table) => [index("trade_user_time_idx").on(table.userId, table.time)],
);

/**
 * Saved backtests. The settings and the summary are stored as JSON text:
 * they're always read and written whole, never queried by field.
 */
export const backtestRun = sqliteTable(
  "backtest_run",
  {
    id: text("id").primaryKey(),
    userId: userId(),
    name: text("name").notNull(),
    config: text("config").notNull(),
    summary: text("summary").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("backtest_run_user_idx").on(table.userId, table.createdAt)],
);

/** Dividends and splits applied to the account. IDs are per user ("dividend:KO:<time>"), so the key includes the user. */
export const accountEvent = sqliteTable(
  "account_event",
  {
    userId: userId(),
    id: text("id").notNull(),
    kind: text("kind", { enum: ["dividend", "split"] }).notNull(),
    symbol: text("symbol").notNull(),
    time: integer("time").notNull(),
    shares: integer("shares").notNull(),
    value: real("value").notNull(),
    cash: real("cash").notNull(),
    sharesAfter: integer("shares_after"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] }), index("account_event_user_time_idx").on(table.userId, table.time)],
);

/** Limit and stop orders: open ones, and recently closed ones to show what happened. */
export const pendingOrder = sqliteTable(
  "pending_order",
  {
    id: text("id").primaryKey(),
    userId: userId(),
    symbol: text("symbol").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    type: text("type", { enum: ["limit", "stop"] }).notNull(),
    shares: integer("shares").notNull(),
    price: real("price").notNull(),
    duration: text("duration", { enum: ["day", "gtc"] }).notNull(),
    createdAt: integer("created_at").notNull(),
    status: text("status", { enum: ["open", "filled", "cancelled", "expired"] }).notNull(),
    closedAt: integer("closed_at"),
    fillPrice: real("fill_price"),
    note: text("note"),
  },
  (table) => [index("pending_order_user_idx").on(table.userId, table.createdAt)],
);

export const priceAlert = sqliteTable(
  "price_alert",
  {
    id: text("id").primaryKey(),
    userId: userId(),
    symbol: text("symbol").notNull(),
    direction: text("direction", { enum: ["above", "below"] }).notNull(),
    price: real("price").notNull(),
    createdAt: integer("created_at").notNull(),
    triggeredAt: integer("triggered_at"),
    triggerPrice: real("trigger_price"),
    seen: integer("seen", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [index("price_alert_user_idx").on(table.userId, table.createdAt)],
);

/**
 * Users who chose to appear on the leaderboard, under a display name (never
 * their email). `startValue` is their account's total value when they joined:
 * they're ranked by their return since then.
 */
export const leaderboardEntry = sqliteTable(
  "leaderboard_entry",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    /** The name in lower case, so "Ann" and "ann" can't both be taken. */
    nameKey: text("name_key").notNull().unique(),
    joinedAt: integer("joined_at").notNull(),
    startValue: real("start_value").notNull(),
  },
);
