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
import { createAccountRepository } from "./accounts";
import { createBacktestRepository } from "./backtests";
import * as schema from "./schema";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let repo: ReturnType<typeof createBacktestRepository>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-bt-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  repo = createBacktestRepository(db);
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

let userId: string;
let n = 0;
beforeEach(async () => {
  userId = `user-${++n}`;
  await db.insert(schema.user).values({ id: userId, name: "T", email: `${userId}@example.com` });
});

const run = (name: string, createdAt: number): SavedRun => ({
  id: `${userId}-${name}`,
  name,
  createdAt,
  config: {
    version: 2,
    holdings: [{ symbol: "AAPL", weight: 1 }],
    strategy: { kind: "buy-and-hold" },
    start: 1,
    end: 2,
    initialCash: 10_000,
    costs: { commission: 0, slippageBps: 0 },
    benchmark: "market",
  },
  summary: { finalValue: 11_000, totalReturn: 0.1, cagr: 0.02, maxDrawdown: 0.2, benchmarkTotalReturn: 0.05 },
});

describe("backtest repository", () => {
  it("saves and lists runs, newest first", async () => {
    await repo.save(userId, run("older", 1));
    await repo.save(userId, run("newer", 2));
    expect((await repo.list(userId)).map((r) => r.name)).toEqual(["newer", "older"]);
    expect((await repo.list(userId))[0]).toEqual(run("newer", 2));
  });

  it("keeps users' runs apart, including deletes", async () => {
    const other = `${userId}-other`;
    await db.insert(schema.user).values({ id: other, name: "O", email: `${other}@example.com` });
    await repo.save(userId, run("mine", 1));
    expect(await repo.list(other)).toEqual([]);
    await repo.remove(other, `${userId}-mine`); // not theirs: nothing happens
    expect(await repo.list(userId)).toHaveLength(1);
    await repo.remove(userId, `${userId}-mine`);
    expect(await repo.list(userId)).toHaveLength(0);
  });

  it(`stops at ${MAX_SAVED_RUNS} runs`, async () => {
    for (let i = 0; i < MAX_SAVED_RUNS; i++) expect(await repo.save(userId, run(`r${i}`, i))).toBe(true);
    expect(await repo.save(userId, run("one too many", 999))).toBe(false);
  });

  it("skips stored rows that no longer validate", async () => {
    await repo.save(userId, run("good", 1));
    await db.update(schema.backtestRun).set({ config: "{broken" }).where(eq(schema.backtestRun.id, `${userId}-good`));
    expect(await repo.list(userId)).toEqual([]);
  });

  it("shares the write queue with the account repository (no deadlock)", async () => {
    const accounts = createAccountRepository(db);
    await accounts.ensure(userId);
    const [saved, traded] = await Promise.all([
      repo.save(userId, run("concurrent", 1)),
      accounts.placeOrder(userId, { symbol: "V", side: "buy", shares: 1, price: 348.1, id: `${userId}-t`, time: 1 }),
    ]);
    expect(saved).toBe(true);
    expect(traded.ok).toBe(true);
  });
});

describe("leaderboard repository", async () => {
  const { createLeaderboardRepository } = await import("./leaderboard");
  it("joins once per user, keeps names unique ignoring case, and leaves", async () => {
    const board = createLeaderboardRepository(db);
    const other = `${userId}-b`;
    await db.insert(schema.user).values({ id: other, name: "B", email: `${other}@example.com` });
    expect(await board.join(userId, { displayName: "Ann", nameKey: `ann-${userId}`, joinedAt: 1, startValue: 100 })).toBe("joined");
    expect(await board.join(userId, { displayName: "Ann 2", nameKey: `ann2-${userId}`, joinedAt: 2, startValue: 100 })).toBe("member");
    expect(await board.join(other, { displayName: "ANN", nameKey: `ann-${userId}`, joinedAt: 3, startValue: 100 })).toBe("taken");
    expect(await board.get(userId)).toEqual({ displayName: "Ann", joinedAt: 1, startValue: 100 });
    expect((await board.members()).find((m) => m.displayName === "Ann")).toMatchObject({ startValue: 100, cash: 0, holdings: [] });
    await board.leave(userId);
    expect(await board.get(userId)).toBeNull();
  });
});
