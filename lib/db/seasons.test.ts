// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placeOrder } from "../trading";
import { createAccountRepository } from "./accounts";
import { createSeasonRepository } from "./seasons";
import * as schema from "./schema";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let seasons: ReturnType<typeof createSeasonRepository>;
let accounts: ReturnType<typeof createAccountRepository>;
const T = Date.parse("2026-11-03T21:00:00Z");
const DAY = 86_400_000;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-seasons-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  seasons = createSeasonRepository(db);
  accounts = createAccountRepository(db);
  await db.insert(schema.user).values(["ann", "bob", "cat"].map((id) => ({ id, name: id, email: `${id}@example.com` })));
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

let annAccount: string;
let bobAccount: string;

describe("joining a season", () => {
  it("gives a separate $100,000 portfolio owned by the player", async () => {
    const joined = await seasons.join("ann", "2026-11", { displayName: "Ann", nameKey: "ann" }, T);
    expect(joined.status).toBe("joined");
    annAccount = joined.accountId!;
    expect(await accounts.load(annAccount)).toMatchObject({ cash: 100_000, holdings: [], watchlist: [] });
    expect(await seasons.entryByAccount("ann", annAccount)).toMatchObject({ seasonId: "2026-11", displayName: "Ann", startValue: 100_000, closedAt: null });
    // Nobody else can claim it.
    expect(await seasons.entryByAccount("bob", annAccount)).toBeNull();
  });

  it("allows one entry each, and one of each name", async () => {
    expect(await seasons.join("ann", "2026-11", { displayName: "Ann again", nameKey: "ann again" }, T)).toEqual({ status: "member", accountId: annAccount });
    expect((await seasons.join("bob", "2026-11", { displayName: "ANN", nameKey: "ann" }, T)).status).toBe("taken");
    const bob = await seasons.join("bob", "2026-11", { displayName: "Bob", nameKey: "bob" }, T + 1);
    bobAccount = bob.accountId!;
    expect((await seasons.entriesOf("bob")).map((e) => e.seasonId)).toEqual(["2026-11"]);
  });
});

describe("standings", () => {
  it("list every entry with its holdings", async () => {
    await accounts.update(bobAccount, null, (a) => {
      const r = placeOrder(a, { id: "t1", symbol: "KO", side: "buy", shares: 100, price: 70, time: T + 2 });
      return r.ok ? { ok: true, account: r.account } : { ok: false, message: r.message };
    });
    const entries = await seasons.entriesWithHoldings("2026-11");
    const bob = entries.find((e) => e.userId === "bob")!;
    expect(bob.cash).toBe(93_000);
    expect(bob.holdings).toEqual([{ symbol: "KO", shares: 100, averageCost: 70 }]);
  });

  it("are recorded at each close, and the last one is what a season closes on", async () => {
    await seasons.recordStandings(T, [{ accountId: annAccount, value: 100_000 }, { accountId: bobAccount, value: 100_500 }]);
    await seasons.recordStandings(T + DAY, [{ accountId: annAccount, value: 101_000 }, { accountId: bobAccount, value: 100_200 }]);
    await seasons.recordStandings(T + DAY, [{ accountId: annAccount, value: 101_500 }, { accountId: bobAccount, value: 100_200 }]); // the same close again replaces it
    expect((await seasons.history("2026-11", [annAccount])).get(annAccount)).toEqual([{ time: T, value: 100_000 }, { time: T + DAY, value: 101_500 }]);
    expect(await seasons.lastValues("2026-11")).toEqual(new Map([[annAccount, 101_500], [bobAccount, 100_200]]));
  });

  it("are frozen when the season closes, and its portfolios stop being processed", async () => {
    expect(await accounts.listBehind(T + 5 * DAY, 10)).toEqual(expect.arrayContaining([annAccount, bobAccount]));
    await seasons.close("2026-11", [{ accountId: annAccount, value: 101_500, rank: 1 }, { accountId: bobAccount, value: 100_200, rank: 2 }], T + 30 * DAY);
    expect(await seasons.entryOf("ann", "2026-11")).toMatchObject({ finalValue: 101_500, finalRank: 1, closedAt: T + 30 * DAY });
    const behind = await accounts.listBehind(T + 5 * DAY, 10);
    expect(behind).not.toContain(annAccount);
    expect(behind).not.toContain(bobAccount);
    expect(await seasons.list()).toEqual([expect.objectContaining({ id: "2026-11", entrants: 2, winner: { seasonId: "2026-11", displayName: "Ann", finalValue: 101_500 } })]);
    expect(await seasons.ownersOf("2026-11")).toEqual(expect.arrayContaining(["ann", "bob"]));
  });
});

describe("badges and activity", () => {
  it("are kept once earned, and never doubled", async () => {
    await seasons.award("ann", [{ kind: "season-winner", scope: "2026-11" }, { kind: "first-lesson", scope: "" }], T);
    await seasons.award("ann", [{ kind: "season-winner", scope: "2026-11" }], T + 1);
    expect((await seasons.badgesOf("ann")).map((b) => [b.kind, b.scope, b.earnedAt])).toEqual(
      expect.arrayContaining([
        ["season-winner", "2026-11", T],
        ["first-lesson", "", T],
      ]),
    );
    expect(await seasons.badgesOf("ann")).toHaveLength(2);
    expect((await seasons.badgesFor(["ann", "cat"])).get("cat")).toBeUndefined();
  });

  it("count trades in every portfolio a user has, and lessons passed", async () => {
    await db.insert(schema.learner).values({ id: "l-bob", userId: "bob", createdAt: T, updatedAt: T });
    await db.insert(schema.lessonProgress).values([
      { learnerId: "l-bob", term: "sharpe", answers: "[]", total: 4, bestScore: 4, passedAt: T + 5, updatedAt: T + 5 },
      { learnerId: "l-bob", term: "beta", answers: "[]", total: 4, bestScore: 1, passedAt: null, updatedAt: T + 6 },
    ]);
    expect(await seasons.lessonsPassed("bob")).toBe(1);
    expect((await seasons.activity("bob", T)).sort()).toEqual([T + 2, T + 5]); // the season trade, and the pass
  });
});
