// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { eq, is, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SavedRun } from "../backtest/config";
import { answerQuestion } from "../lessons/progress";
import { DATA_KINDS } from "../profile";
import { startingAccount } from "../starting-account";
import { placeOrder } from "../trading";
import { createAccountRepository } from "./accounts";
import { createAlertEmailRepository } from "./alert-emails";
import { createBacktestRepository } from "./backtests";
import { createGuestRepository } from "./guests";
import { createLeaderboardRepository } from "./leaderboard";
import { createLearningRepository } from "./learning";
import { createPersonalDataRepository, USER_TABLES } from "./personal-data";
import { createPushRepository } from "./push";
import * as schema from "./schema";
import { createSeasonRepository } from "./seasons";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let data: ReturnType<typeof createPersonalDataRepository>;
let accounts: ReturnType<typeof createAccountRepository>;
let backtests: ReturnType<typeof createBacktestRepository>;
let learning: ReturnType<typeof createLearningRepository>;
let push: ReturnType<typeof createPushRepository>;
let seasons: ReturnType<typeof createSeasonRepository>;
let leaderboard: ReturnType<typeof createLeaderboardRepository>;
let guests: ReturnType<typeof createGuestRepository>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-personal-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  data = createPersonalDataRepository(db);
  accounts = createAccountRepository(db);
  backtests = createBacktestRepository(db);
  learning = createLearningRepository(db);
  push = createPushRepository(db);
  seasons = createSeasonRepository(db);
  leaderboard = createLeaderboardRepository(db);
  guests = createGuestRepository(db);
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
let userId: string;
let other: string;
beforeEach(async () => {
  userId = `user-${++n}`;
  other = `other-${n}`;
  for (const id of [userId, other]) await db.insert(schema.user).values({ id, name: "T", email: `${id}@example.com` });
});

const quiz = [1, 0, 2, 1].map((answer) => ({ answer, choices: ["a", "b", "c", "d"] }));
const run = (owner: string): SavedRun => ({
  id: `${owner}-run`,
  name: "run",
  createdAt: 1,
  config: { version: 2, holdings: [{ symbol: "KO", weight: 1 }], strategy: { kind: "buy-and-hold" }, start: 1, end: 2, initialCash: 10_000, costs: { commission: 0, slippageBps: 0 }, benchmark: "same-stocks" },
  summary: { finalValue: 1, totalReturn: 0, cagr: 0, maxDrawdown: 0, benchmarkTotalReturn: 0 },
});

/** Gives `id` some of every kind of data: a traded portfolio, a watchlist and alert, a saved run, lessons, the leaderboard, a season, a badge, notifications, a picture, a session and a password. */
async function fill(id: string) {
  await accounts.update(id, null, (a) => {
    const r = placeOrder(a, { id: crypto.randomUUID(), symbol: "KO", side: "buy", shares: 3, price: 70, time: 5 });
    return r.ok ? { ok: true, account: { ...r.account, watchlist: ["KO", "PEP"], alerts: [{ id: `${id}-alert`, symbol: "KO", direction: "above", price: 99, createdAt: 1 }] } } : { ok: false, message: r.message };
  });
  await db.insert(schema.portfolioValue).values({ userId: id, time: 1, value: 1, cash: 1 });
  await backtests.save(id, run(id));
  await learning.change(id, "sharpe", (p) => answerQuestion(p, quiz, 0, 1, 2), 2);
  await leaderboard.join(id, { displayName: `Board ${id}`, nameKey: `board ${id}`, joinedAt: 1, startValue: 1 });
  const { accountId } = await seasons.join(id, "2026-10", { displayName: `Season ${id}`, nameKey: `season ${id}` }, 1);
  await seasons.recordStandings(1, [{ accountId: accountId!, value: 100_000 }]);
  await seasons.award(id, [{ kind: "first-lesson", scope: "" }], 1);
  await createAlertEmailRepository(db).setEnabled(id, true, 1);
  await push.add(id, { endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "k", auth: "a" }, 5, 1);
  await data.setAvatar(id, "image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "abcdef0123456789", "/api/account/avatar?v=abcdef0123456789", 1);
  await db.insert(schema.session).values({ id: `${id}-s`, token: `${id}-token`, userId: id, expiresAt: new Date(10 ** 13), ipAddress: "203.0.113.5", userAgent: "Test" });
  await db.insert(schema.account).values({ id: `${id}-a`, accountId: id, providerId: "credential", userId: id, password: "hash-never-exported", accessToken: "token-never-exported" });
  return accountId!;
}

/** How many rows each per-user table holds for `id` (season standings by the season accounts it owns). */
async function counts(id: string) {
  const out: Record<string, number> = {};
  for (const table of USER_TABLES) {
    const where = table === "season_standing" ? sql`account_id IN (SELECT id FROM user WHERE season_of = ${id})` : sql`user_id = ${id}`;
    const rows = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM ${sql.identifier(table)} WHERE ${where}`);
    out[table] = Number(rows[0].n);
  }
  out.lesson_progress = Number((await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM lesson_progress WHERE learner_id IN (SELECT id FROM learner WHERE user_id = ${id})`))[0].n);
  out.season_accounts = Number((await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM user WHERE season_of = ${id}`))[0].n);
  return out;
}

describe("USER_TABLES", () => {
  it("lists every table with rows belonging to a user, so none is forgotten when erasing", () => {
    const perUser = (Object.values(schema) as unknown[])
      .filter((value): value is SQLiteTable => is(value, SQLiteTable))
      .map((table) => getTableConfig(table))
      .filter((config) => config.columns.some((c) => c.name === "user_id" || c.name === "account_id"))
      .map((config) => config.name)
      .sort();
    expect(perUser).toEqual([...USER_TABLES].sort());
  });
});

describe("eraseEverything", () => {
  it("leaves nothing of the user's but the user, sessions and sign-in methods (for Better Auth to delete), and nothing of anyone else's goes", async () => {
    await fill(userId);
    await fill(other);
    const before = await counts(other);

    await data.eraseEverything(userId);

    const after = await counts(userId);
    for (const [table, count] of Object.entries(after)) expect([table, count]).toEqual([table, table === "session" || table === "account" ? 1 : 0]);
    expect(await counts(other)).toEqual(before);
  });
});

describe("erase by kind", () => {
  it("restarts the portfolio from the starter one, keeping the watchlist and alerts, and leaves the all-time leaderboard", async () => {
    await fill(userId);
    await data.erase(userId, ["portfolio"]);
    const account = await accounts.load(userId);
    expect(account?.cash).toBe(startingAccount().cash);
    expect(account?.holdings).toEqual(startingAccount().holdings);
    expect(account?.trades).toEqual([]);
    expect(account?.watchlist).toEqual(["KO", "PEP"]);
    expect(account?.alerts?.map((a) => a.id)).toEqual([`${userId}-alert`]);
    expect(await leaderboard.get(userId)).toBeNull();
    const c = await counts(userId);
    expect([c.portfolio_value, c.backtest_run, c.season_entry]).toEqual([0, 1, 1]);
  });

  it("erases only the chosen kinds", async () => {
    await fill(userId);
    await data.erase(userId, ["watchlist", "backtests", "lessons", "notifications", "picture"]);
    const c = await counts(userId);
    expect(c).toMatchObject({ watchlist_item: 0, price_alert: 0, backtest_run: 0, learner: 0, lesson_progress: 0, push_subscription: 0, email_preference: 0, avatar: 0 });
    expect(c).toMatchObject({ trade: 1, leaderboard_entry: 1, season_entry: 1, badge: 1 });
    const [row] = await db.select({ image: schema.user.image }).from(schema.user).where(eq(schema.user.id, userId));
    expect(row.image).toBeNull();
  });

  it("erases competitions with their hidden season accounts", async () => {
    const accountId = await fill(userId);
    await data.erase(userId, ["community"]);
    const c = await counts(userId);
    expect(c).toMatchObject({ leaderboard_entry: 0, season_entry: 0, season_standing: 0, badge: 0, season_accounts: 0 });
    expect(await accounts.load(accountId)).toBeNull();
    expect(c.trade).toBe(1);
  });

  it("knows every kind", async () => {
    await fill(userId);
    await data.erase(userId, DATA_KINDS);
    expect((await counts(userId)).season_accounts).toBe(0);
  });
});

describe("deleteGuest", () => {
  it("deletes a guest with everything it saved", async () => {
    const guest = await guests.create(1);
    await accounts.ensure(guest);
    await backtests.save(guest, run(guest));
    await data.deleteGuest(guest);
    expect((await db.select().from(schema.user).where(eq(schema.user.id, guest))).length).toBe(0);
    expect(await backtests.list(guest)).toEqual([]);
  });

  it("never deletes a real account", async () => {
    await data.deleteGuest(userId);
    expect((await db.select().from(schema.user).where(eq(schema.user.id, userId))).length).toBe(1);
  });
});

describe("exportAll", () => {
  it("holds every kind of data, and no secrets", async () => {
    await fill(userId);
    const exported = await data.exportAll(userId);
    expect(exported?.profile.email).toBe(`${userId}@example.com`);
    expect(exported?.portfolio?.trades).toHaveLength(1);
    expect(exported?.watchlist).toEqual(["KO", "PEP"]);
    expect(exported?.alerts).toHaveLength(1);
    expect(exported?.savedRuns).toHaveLength(1);
    expect(exported?.lessons[0]?.answers).toEqual([1, null, null, null]);
    expect(exported?.leaderboard?.displayName).toBe(`Board ${userId}`);
    expect(exported?.seasons[0]).toMatchObject({ seasonId: "2026-10", displayName: `Season ${userId}`, standings: [{ time: 1, value: 100_000 }] });
    expect(exported?.seasons[0].portfolio?.cash).toBe(100_000);
    expect(exported?.badges).toHaveLength(1);
    expect(exported?.emailPreferences?.alertEmails).toBe(true);
    expect(exported?.pushDevices).toEqual([{ pushService: "fcm.googleapis.com", createdAt: 1, lastSentAt: null }]);
    expect(exported?.profilePicture?.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(exported?.sessions[0]).toMatchObject({ ipAddress: "203.0.113.5", userAgent: "Test" });
    expect(exported?.signInMethods.map((m) => m.method)).toEqual(["credential"]);

    const text = JSON.stringify(exported);
    for (const secret of ["hash-never-exported", "token-never-exported", `${userId}-token`, `/fcm/send/${userId}`]) expect(text).not.toContain(secret);
    expect(text).not.toContain(other);
  });

  it("is null for nobody", async () => {
    expect(await data.exportAll("nobody")).toBeNull();
  });
});

describe("profile pictures and sign-ins", () => {
  it("saves, replaces and reads a picture", async () => {
    await data.setAvatar(userId, "image/png", Buffer.from([1]), "1111111111111111", "/api/account/avatar?v=1111111111111111", 1);
    await data.setAvatar(userId, "image/webp", Buffer.from([2]), "2222222222222222", "/api/account/avatar?v=2222222222222222", 2);
    expect(await data.avatar(userId)).toEqual({ type: "image/webp", data: Buffer.from([2]), version: "2222222222222222" });
    const [row] = await db.select({ image: schema.user.image }).from(schema.user).where(eq(schema.user.id, userId));
    expect(row.image).toBe("/api/account/avatar?v=2222222222222222");
    expect(await data.avatar(other)).toBeNull();
  });

  it("tells password accounts from Google-only ones", async () => {
    await db.insert(schema.account).values({ id: `${userId}-g`, accountId: "google-sub", providerId: "google", userId });
    expect(await data.hasPassword(userId)).toBe(false);
    expect(await data.signInMethods(userId)).toEqual(["google"]);
    await db.insert(schema.account).values({ id: `${userId}-c`, accountId: userId, providerId: "credential", userId, password: "h" });
    expect(await data.hasPassword(userId)).toBe(true);
    expect(await data.signInMethods(userId)).toEqual(["credential", "google"]);
  });

  it("deletes expired sessions and sign-in values only", async () => {
    await db.insert(schema.session).values([
      { id: `${userId}-old`, token: `${userId}-old`, userId, expiresAt: new Date(100) },
      { id: `${userId}-new`, token: `${userId}-new`, userId, expiresAt: new Date(10 ** 13) },
    ]);
    await db.insert(schema.verification).values([
      { id: `${userId}-v1`, identifier: "x", value: "y", expiresAt: new Date(100) },
      { id: `${userId}-v2`, identifier: "x", value: "y", expiresAt: new Date(10 ** 13) },
    ]);
    await data.pruneExpiredSignIns(1_000);
    expect((await db.select({ id: schema.session.id }).from(schema.session).where(eq(schema.session.userId, userId))).map((s) => s.id)).toEqual([`${userId}-new`]);
    expect((await db.select({ id: schema.verification.id }).from(schema.verification)).map((v) => v.id)).not.toContain(`${userId}-v1`);
  });
});
