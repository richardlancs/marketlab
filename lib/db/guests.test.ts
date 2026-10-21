// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_SAVED_RUNS, type SavedRun } from "../backtest/config";
import { answerQuestion } from "../lessons/progress";
import { placeOrder } from "../trading";
import { createAccountRepository } from "./accounts";
import { createBacktestRepository } from "./backtests";
import { createGuestRepository } from "./guests";
import { createLearningRepository } from "./learning";
import { createPushRepository } from "./push";
import * as schema from "./schema";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let guests: ReturnType<typeof createGuestRepository>;
let accounts: ReturnType<typeof createAccountRepository>;
let backtests: ReturnType<typeof createBacktestRepository>;
let learning: ReturnType<typeof createLearningRepository>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-guest-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  guests = createGuestRepository(db);
  accounts = createAccountRepository(db);
  backtests = createBacktestRepository(db);
  learning = createLearningRepository(db);
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

let userId: string;
let guestId: string;
let n = 0;
beforeEach(async () => {
  userId = `user-${++n}`;
  await db.insert(schema.user).values({ id: userId, name: "T", email: `${userId}@example.com` });
  guestId = await guests.create(1_000);
});

const quiz = [1, 0, 2, 1].map((answer) => ({ answer, choices: ["a", "b", "c", "d"] }));
/** A guest who bought shares: a portfolio of their own, not the starting one. */
async function trade(id: string, shares = 2) {
  await accounts.update(id, null, (a) => {
    const r = placeOrder(a, { id: crypto.randomUUID(), symbol: "KO", side: "buy", shares, price: 70, time: 5 });
    return r.ok ? { ok: true, account: r.account } : { ok: false, message: r.message };
  });
}
const run = (owner: string, name: string, createdAt: number): SavedRun => ({
  id: `${owner}-${name}`,
  name,
  createdAt,
  config: { version: 2, holdings: [{ symbol: "KO", weight: 1 }], strategy: { kind: "buy-and-hold" }, start: 1, end: 2, initialCash: 10_000, costs: { commission: 0, slippageBps: 0 }, benchmark: "same-stocks" },
  summary: { finalValue: 1, totalReturn: 0, cagr: 0, maxDrawdown: 0, benchmarkTotalReturn: 0 },
});
/** How many KO shares an account holds (accounts start with the starter portfolio's other stocks). */
const ko = async (id: string) => (await accounts.load(id))?.holdings.find((h) => h.symbol === "KO")?.shares;
const userExists = async (id: string) => (await db.select().from(schema.user).where(eq(schema.user.id, id))).length > 0;

describe("guests", () => {
  it("are users marked as guests, with an address that can't receive mail", async () => {
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, guestId));
    expect(row.isGuest).toBe(true);
    expect(row.email).toMatch(/@guest\.invalid$/);
    expect(await guests.lastActive(guestId)).toBe(1_000);
  });

  it("can't be impersonated with a real user's ID", async () => {
    expect(await guests.lastActive(userId)).toBeNull();
    expect(await guests.lastActive("nobody")).toBeNull();
  });
});

describe("signing in: the handover", () => {
  it("gives a new account the guest's portfolio, backtests and progress, then removes the guest", async () => {
    await trade(guestId);
    await backtests.save(guestId, run(guestId, "a", 1));
    await learning.change(guestId, "sharpe", (p) => answerQuestion(p, quiz, 0, 1, 2), 2);

    expect(await guests.handover(guestId, userId, 10)).toEqual({ conflict: null });
    expect(await ko(userId)).toBe(2);
    expect((await backtests.list(userId)).map((r) => r.name)).toEqual(["a"]);
    expect((await learning.load(userId)).sharpe?.answers).toEqual([1, null, null, null]);
    expect(await userExists(guestId)).toBe(false);
    expect(await accounts.load(guestId)).toBeNull();
  });

  it("moves the guest's notification devices to the account", async () => {
    const push = createPushRepository(db);
    const device = { endpoint: `https://fcm.googleapis.com/fcm/send/${guestId}`, p256dh: "k", auth: "a" };
    await push.add(guestId, device, 10);
    await trade(guestId, 2);
    await trade(userId, 5);
    // Even while the portfolio choice is pending: the device is the browser they're signed in on now.
    await guests.handover(guestId, userId, 10);
    expect(await push.get(userId, device.endpoint)).toEqual(device);
    expect(await push.get(guestId, device.endpoint)).toBeNull();
  });

  it("drops an untouched guest portfolio without asking, keeping the account's", async () => {
    await accounts.ensure(guestId);
    await trade(userId, 5);
    expect(await guests.handover(guestId, userId, 10)).toEqual({ conflict: null });
    expect(await ko(userId)).toBe(5);
    expect(await userExists(guestId)).toBe(false);
  });

  it("asks when both have a portfolio of their own, and keeps the guest until answered", async () => {
    await trade(guestId, 2);
    await trade(userId, 5);
    await backtests.save(guestId, run(guestId, "b", 1));
    const result = await guests.handover(guestId, userId, 10);
    expect(result.conflict?.holdings.find((h) => h.symbol === "KO")?.shares).toBe(2);
    // Everything else has already moved; only the portfolio waits.
    expect((await backtests.list(userId)).map((r) => r.name)).toEqual(["b"]);
    expect(await guests.pending(guestId)).not.toBeNull();
  });

  it("keeps the account's portfolio, or takes the guest's, when the user chooses", async () => {
    await trade(guestId, 2);
    await trade(userId, 5);
    await guests.handover(guestId, userId, 10);
    expect(await guests.resolve(guestId, userId, "use-guest")).toBe(true);
    expect(await ko(userId)).toBe(2);
    expect(await userExists(guestId)).toBe(false);

    const other = await guests.create(1);
    await trade(other, 9);
    await guests.handover(other, userId, 11);
    expect(await guests.resolve(other, userId, "keep-account")).toBe(true);
    expect(await ko(userId)).toBe(2);
    expect(await userExists(other)).toBe(false);
  });

  it("never hands over to or from the wrong kind of user", async () => {
    const otherUser = `${userId}-b`;
    await db.insert(schema.user).values({ id: otherUser, name: "B", email: `${otherUser}@example.com` });
    await trade(otherUser);
    expect(await guests.handover(otherUser, userId, 10)).toEqual({ conflict: null }); // not a guest: nothing moves
    expect(await accounts.load(userId)).toBeNull();
    expect(await guests.resolve(otherUser, userId, "use-guest")).toBe(false);
    expect(await userExists(otherUser)).toBe(true);
  });

  it("moves only as many saved runs as the account has room for", async () => {
    for (let i = 0; i < MAX_SAVED_RUNS - 1; i++) await backtests.save(userId, run(userId, `u${i}`, i));
    await backtests.save(guestId, run(guestId, "old", 1));
    await backtests.save(guestId, run(guestId, "new", 2));
    await guests.handover(guestId, userId, 10);
    const names = (await backtests.list(userId)).map((r) => r.name);
    expect(names).toHaveLength(MAX_SAVED_RUNS);
    expect(names).toContain("new");
    expect(names).not.toContain("old");
  });
});

describe("cleanup", () => {
  it("deletes inactive guests and what they own, never signed-in users", async () => {
    await trade(guestId);
    await accounts.ensure(userId);
    const fresh = await guests.create(9_000);
    expect(await guests.deleteInactive(5_000, 100)).toBeGreaterThanOrEqual(1);
    expect(await userExists(guestId)).toBe(false);
    expect(await accounts.load(guestId)).toBeNull();
    expect(await userExists(fresh)).toBe(true);
    expect(await userExists(userId)).toBe(true);
  });

  it("keeps a guest that was active recently", async () => {
    await guests.touch(guestId, 9_000);
    await guests.deleteInactive(5_000, 100);
    expect(await userExists(guestId)).toBe(true);
  });
});

describe("the daily job's queries", () => {
  it("lists accounts behind the latest close, longest-waiting first", async () => {
    const a = await guests.create(1);
    const b = await guests.create(1);
    await accounts.ensure(a); // never processed: processedThrough is null
    await accounts.update(b, { raw: {}, actions: {}, latest: 400 }, (x) => ({ ok: true, account: x }));
    const behind = await accounts.listBehind(500, 1000);
    expect(behind.indexOf(a)).toBeGreaterThanOrEqual(0);
    expect(behind.indexOf(b)).toBeGreaterThan(behind.indexOf(a));
    expect(await accounts.listBehind(400, 1000)).not.toContain(b);
  });

  it("deletes learners from before guests were users, once they're old", async () => {
    const old = crypto.randomUUID();
    const recent = crypto.randomUUID();
    await db.insert(schema.learner).values([
      { id: old, userId: null, createdAt: 1, updatedAt: 1 },
      { id: recent, userId: null, createdAt: 1, updatedAt: 9_000 },
    ]);
    await learning.deleteOrphans(5_000, 100);
    const left = (await db.select().from(schema.learner)).map((l) => l.id);
    expect(left).not.toContain(old);
    expect(left).toContain(recent);
  });
});

