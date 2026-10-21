import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLeaderboardRepository } from "./leaderboard";
import * as schema from "./schema";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let board: ReturnType<typeof createLeaderboardRepository>;
const DAY = 86_400_000;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-board-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  board = createLeaderboardRepository(db);
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  for (const table of [schema.leaderboardEntry, schema.holding, schema.portfolio, schema.dailyBar, schema.priceSeries, schema.user]) await db.delete(table);
});

/** A member: a user with a portfolio, holdings, and an entry on the board. */
async function member(name: string, startValue: number, cash: number, holdings: { symbol: string; shares: number; averageCost: number }[] = [], joinedAt = 0) {
  const userId = `u-${name}`;
  await db.insert(schema.user).values({ id: userId, name, email: `${userId}@example.com` });
  await db.insert(schema.portfolio).values({ userId, cash });
  if (holdings.length) await db.insert(schema.holding).values(holdings.map((h) => ({ userId, ...h })));
  await db.insert(schema.leaderboardEntry).values({ userId, displayName: name, nameKey: name.toLowerCase(), joinedAt, startValue });
}

/** Stored closes for a stock (the last one is its latest). */
async function prices(symbol: string, closes: number[], source = "mock") {
  const rows = closes.map((close, i) => ({ source, symbol, time: (i + 1) * DAY, open: close, high: close, low: close, close, adjClose: close, volume: null }));
  await db.insert(schema.dailyBar).values(rows);
  await db.insert(schema.priceSeries).values({ source, symbol, checksum: symbol, firstTime: DAY, lastTime: closes.length * DAY, bars: closes.length, updatedAt: 0 });
}

describe("leaderboard standings, in SQL", () => {
  it("rank by return since joining, whatever each started with", async () => {
    await member("Big", 100_000, 105_000);
    await member("Small", 10_000, 12_000);
    await member("Down", 25_000, 20_000);
    const rows = await board.standings("mock", 10 * DAY);
    expect(rows.map((r) => [r.rank, r.displayName])).toEqual([
      [1, "Small"],
      [2, "Big"],
      [3, "Down"],
    ]);
    expect(rows[0]).toMatchObject({ value: 12_000, daysOnBoard: 10 });
    expect(rows[0].returnSinceJoining).toBeCloseTo(0.2);
  });

  it("value holdings at the latest stored close, or at cost when there's none", async () => {
    await prices("KO", [95, 98, 100]);
    await prices("KO", [10_000], "tiingo"); // another source's prices never leak in
    await member("A", 1000, 0, [
      { symbol: "KO", shares: 10, averageCost: 90 },
      { symbol: "ZZ", shares: 1, averageCost: 50 },
    ]);
    const [row] = await board.standings("mock", 0);
    expect(row.value).toBe(1050);
    expect(await board.unpricedSymbols("mock")).toEqual(["ZZ"]);
  });

  it("break ties by who joined first, and count days on the board", async () => {
    await member("Later", 100, 110, [], 5 * DAY);
    await member("Earlier", 100, 110, [], 1 * DAY);
    const rows = await board.standings("mock", 10 * DAY + 1);
    expect(rows.map((r) => [r.displayName, r.daysOnBoard])).toEqual([
      ["Earlier", 9],
      ["Later", 5],
    ]);
  });

  it("handle an empty board", async () => {
    expect(await board.standings("mock", 0)).toEqual([]);
  });
});
