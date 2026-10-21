// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import screenResult from "../analytics/fixtures/screen-result.json";
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

describe("stored results (reproducibility)", () => {
  const snapshot = {
    version: 1 as const,
    source: "mock" as const,
    simulated: true,
    asOf: 2,
    adjustment: "split-and-dividend-adjusted-closes" as const,
    series: { AAPL: { times: [1, 2], prices: [100, 110] } },
    market: null,
  };
  const equity = [{ time: 1, price: 10_000 }, { time: 2, price: 11_000 }];
  const metrics = { finalValue: 11_000, totalReturn: 0.1, cagr: 0, maxDrawdown: 0, drawdownPeak: null, drawdownTrough: null, volatility: 0, sharpe: null, trades: 1, exposure: 1 };
  const result = {
    outcome: { run: { equity, trades: [], metrics }, benchmark: { equity, trades: [], metrics } },
    note: null,
    provenance: {
      engine: { name: "python", version: "1.0.0" },
      dataset: { checksum: "abc123", datasetVersion: "mock:abc123", source: "mock", simulated: true, asOf: 2, firstDate: 1, lastDate: 2, observations: 2 },
      assumptions: { signals: "…" },
      computedAt: 3,
    },
  };

  it("saves the full result with its prices, and lists what it came from without loading it", async () => {
    await repo.save(userId, run("kept", 1), { result, snapshot, checksum: "abc123" });
    const [listed] = await repo.list(userId);
    expect(listed.stored).toEqual({ engine: { name: "python", version: "1.0.0" }, dataSource: "mock", simulated: true, datasetVersion: "mock:abc123" });
    const found = await repo.get(userId, listed.id);
    expect(found?.stored).toEqual({ result, snapshot });
  });

  it("reads runs saved before results were kept, and marks them", async () => {
    await repo.save(userId, run("old", 1));
    const [listed] = await repo.list(userId);
    expect(listed.stored).toBeUndefined();
    expect((await repo.get(userId, listed.id))?.stored).toBeNull();
  });

  it("finds only the owner's runs", async () => {
    await repo.save(userId, run("mine", 1), { result, snapshot, checksum: "abc123" });
    expect(await repo.get("someone-else", `${userId}-mine`)).toBeNull();
  });

  it("stores each snapshot once, and deletes it when no run uses it", async () => {
    await repo.save(userId, run("a", 1), { result, snapshot, checksum: "shared" });
    await repo.save(userId, run("b", 2), { result, snapshot, checksum: "shared" });
    const count = async () => (await db.select().from(schema.priceSnapshot).where(eq(schema.priceSnapshot.checksum, "shared"))).length;
    expect(await count()).toBe(1);
    await repo.remove(userId, `${userId}-a`);
    await repo.deleteOrphanSnapshots(100);
    expect(await count()).toBe(1); // still used by "b"
    await repo.remove(userId, `${userId}-b`);
    await repo.deleteOrphanSnapshots(100);
    expect(await count()).toBe(0);
  });
});

describe("saved historical screens", () => {
  /** A screen saved as the analytics service saves one (services/analytics/analytics/api.py save_screen). */
  async function saveScreen(id: string, result: unknown = screenResult) {
    await db.insert(schema.backtestRun).values({
      id,
      userId,
      name: "Leaders",
      kind: "historical-screen",
      config: JSON.stringify({ version: 1, preset: "momentum", start: 1, end: 2, initialCash: 10_000, costs: { commission: 1, slippageBps: 5 }, universe: ["AAPL", "MSFT"] }),
      summary: JSON.stringify({ finalValue: 11_000, totalReturn: 0.1, cagr: 0.05, maxDrawdown: 0.1, benchmarkTotalReturn: 0.08 }),
      createdAt: 5,
      result: JSON.stringify(result),
      snapshotChecksum: "c".repeat(64),
      engine: "python",
      engineVersion: "1.3.0",
      dataSource: "mock",
      simulated: true,
      datasetVersion: "mock:cccccccccccc",
    });
  }

  it("lists screens apart from backtests", async () => {
    await repo.save(userId, run("a backtest", 1));
    await saveScreen(`${userId}-screen`);
    expect((await repo.list(userId)).map((r) => r.name)).toEqual(["a backtest"]);
    const [screen] = await repo.listScreens(userId);
    expect(screen).toMatchObject({ id: `${userId}-screen`, config: { universe: ["AAPL", "MSFT"] }, stored: { simulated: true, dataSource: "mock" } });
  });

  it("opens a screen with its stored result, for its owner only", async () => {
    await saveScreen(`${userId}-screen`);
    const found = await repo.getScreen(userId, `${userId}-screen`);
    expect(found?.result?.months).toHaveLength(3);
    expect(await repo.getScreen("someone-else", `${userId}-screen`)).toBeNull();
    // A backtest's ID isn't a screen, and a screen's isn't a backtest.
    await repo.save(userId, run("bt", 1));
    expect(await repo.getScreen(userId, `${userId}-bt`)).toBeNull();
    expect(await repo.get(userId, `${userId}-screen`)).toBeNull();
  });

  it("shares the saved-run limit with backtests", async () => {
    await saveScreen(`${userId}-screen`);
    for (let i = 0; i < MAX_SAVED_RUNS - 1; i++) expect(await repo.save(userId, run(`r${i}`, i))).toBe(true);
    expect(await repo.save(userId, run("one too many", 999))).toBe(false);
  });

  it("deletes a screen like any run, and only the owner's", async () => {
    await saveScreen(`${userId}-screen`);
    await repo.remove("someone-else", `${userId}-screen`);
    expect(await repo.listScreens(userId)).toHaveLength(1);
    await repo.remove(userId, `${userId}-screen`);
    expect(await repo.listScreens(userId)).toHaveLength(0);
  });

  it("opens a screen whose stored result no longer reads, without its result", async () => {
    await saveScreen(`${userId}-screen`, { kind: "something else" });
    expect(await repo.getScreen(userId, `${userId}-screen`)).toMatchObject({ result: null });
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
    expect((await board.standings("mock", 1)).find((m) => m.displayName === "Ann")).toMatchObject({ value: 0, returnSinceJoining: -1 });
    await board.leave(userId);
    expect(await board.get(userId)).toBeNull();
  });
});
