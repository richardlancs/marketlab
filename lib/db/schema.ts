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
import type { AlertCondition } from "../trading";

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
  /**
   * A guest: someone using MarketLab without an account, known only by a
   * random ID in an httpOnly cookie (lib/owner.ts). Guests have no email
   * (a placeholder fills the required column), no password and no session, so
   * they're never "signed in"; but their portfolio, saved backtests and
   * lesson progress live in the database like everyone's. Added by MarketLab,
   * not Better Auth, which leaves it at its default.
   */
  isGuest: integer("is_guest", { mode: "boolean" }).default(false).notNull(),
}, (table) => [index("user_is_guest_idx").on(table.isGuest, table.updatedAt)]);

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
export const portfolio = sqliteTable(
  "portfolio",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    cash: real("cash").notNull(),
    createdAt: createdAt(),
    /** The last close the account was brought up to date with (lib/processing.ts). Null until the first time. */
    processedThrough: integer("processed_through"),
  },
  // The daily job's "who is behind, longest-waiting first" (accounts.listBehind) reads this in order.
  (table) => [index("portfolio_processed_through_idx").on(table.processedThrough)],
);

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
    // Reproducibility (migration 0006). All null for runs saved before it,
    // which kept only their settings and are shown as such.
    /** The full stored result as JSON: the outcome (equity curve, trades, metrics, benchmark), note and provenance. */
    result: text("result"),
    /** The input prices, in price_snapshot. */
    snapshotChecksum: text("snapshot_checksum"),
    engine: text("engine"),
    engineVersion: text("engine_version"),
    dataSource: text("data_source"),
    simulated: integer("simulated", { mode: "boolean" }),
    datasetVersion: text("dataset_version"),
  },
  (table) => [
    index("backtest_run_user_idx").on(table.userId, table.createdAt),
    // "Is any run still using this snapshot?", asked per snapshot by the daily cleanup.
    index("backtest_run_snapshot_idx").on(table.snapshotChecksum),
  ],
);

/**
 * The exact input prices of saved backtests (lib/backtest/snapshot.ts), one
 * row per distinct set, keyed by its SHA-256 checksum: immutable, and shared
 * by every run calculated from the same prices. Rows no saved run refers to
 * are deleted by the daily job.
 */
export const priceSnapshot = sqliteTable("price_snapshot", {
  checksum: text("checksum").primaryKey(),
  /** The snapshot as JSON. */
  data: text("data").notNull(),
  source: text("source").notNull(),
  simulated: integer("simulated", { mode: "boolean" }).notNull(),
  asOf: integer("as_of").notNull(),
  createdAt: integer("created_at").notNull(),
});

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
    /** An indicator alert's condition (lib/trading.ts AlertCondition), as JSON; null for a price alert. */
    condition: text("condition", { mode: "json" }).$type<AlertCondition>(),
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

// ---------------------------------------------------------------------------
// Lesson progress (quiz answers, best scores, passes), for everyone.
// ---------------------------------------------------------------------------

/**
 * Whoever is working through the lessons: a user, signed in or a guest
 * (see `user.isGuest`), linked by `userId`. A null `userId` is a learner from
 * before guests were users (Phase 10's learner cookie); it's attached to a
 * user the next time that browser visits (lib/owner.ts).
 */
export const learner = sqliteTable("learner", {
  id: text("id").primaryKey(),
  /** Null for an anonymous guest. */
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  /** Last time it changed: lets old anonymous learners be told apart and cleaned up later. */
  updatedAt: integer("updated_at").notNull(),
});

/** One row per learner and lesson (see LessonProgress in lib/lessons/progress.ts). */
export const lessonProgress = sqliteTable(
  "lesson_progress",
  {
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    /** The glossary term the lesson is about, e.g. "sharpe". */
    term: text("term").notNull(),
    /** The current attempt's answers, as JSON: [1, null, 2, null]. Always read and written whole. */
    answers: text("answers").notNull(),
    total: integer("total").notNull(),
    bestScore: integer("best_score"),
    passedAt: integer("passed_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.learnerId, table.term] })],
);

// ---------------------------------------------------------------------------
// The price store and stored analytics (Phase 12). Prices are written by the
// Next.js server from its market data (lib/db/prices.ts); the Python analytics
// service reads them and writes analytics_result rows, which pages read.
// ---------------------------------------------------------------------------

/** Daily bars as the market-data source gives them, per source ("mock" or "tiingo") so the two never mix. Indices use their own symbol (SPX…). */
export const dailyBar = sqliteTable(
  "daily_bar",
  {
    source: text("source").notNull(),
    symbol: text("symbol").notNull(),
    /** The day's close (ms). */
    time: integer("time").notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    /** The close adjusted for every later dividend and split. */
    adjClose: real("adj_close").notNull(),
    volume: real("volume"),
  },
  (table) => [primaryKey({ columns: [table.source, table.symbol, table.time] })],
);

/** One row per stored series: its checksum (SHA-256 of every bar), so an unchanged series is never rewritten, and its latest fundamentals. */
export const priceSeries = sqliteTable(
  "price_series",
  {
    source: text("source").notNull(),
    symbol: text("symbol").notNull(),
    checksum: text("checksum").notNull(),
    firstTime: integer("first_time").notNull(),
    lastTime: integer("last_time").notNull(),
    bars: integer("bars").notNull(),
    /** Fundamentals as of the last bar, when the source has them (the mock market does; Tiingo's free data doesn't). */
    marketCap: real("market_cap"),
    peRatio: real("pe_ratio"),
    /** The indicated yearly dividend over the price, as a fraction. */
    dividendYield: real("dividend_yield"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.source, table.symbol] })],
);

/**
 * Results the analytics service calculated from stored prices: a stock's
 * risk and technical profile, and so on. One current row per kind and subject
 * (a symbol, or "all"), with the checksum of the prices it used and the
 * analytics version, so a page can tell a stale result from a fresh one.
 */
export const analyticsResult = sqliteTable(
  "analytics_result",
  {
    kind: text("kind").notNull(),
    subject: text("subject").notNull(),
    source: text("source").notNull(),
    version: text("version").notNull(),
    inputChecksum: text("input_checksum").notNull(),
    /** The last close the result includes (ms). */
    asOf: integer("as_of").notNull(),
    /** The result as JSON. */
    result: text("result").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.subject, table.source] })],
);
