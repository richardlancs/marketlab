// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { answerQuestion, retry } from "../lessons/progress";
import { createLearningRepository } from "./learning";
import * as schema from "./schema";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let repo: ReturnType<typeof createLearningRepository>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-learn-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  repo = createLearningRepository(db);
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

const quiz = [1, 0, 2, 1].map((answer) => ({ answer, choices: ["a", "b", "c", "d"] }));
const answer = (index: number, choice: number, now = 100) => (p: Parameters<typeof answerQuestion>[0]) => answerQuestion(p, quiz, index, choice, now);

describe("signed-in progress", () => {
  it("starts empty, and saves answers as they're given", async () => {
    expect(await repo.loadForUser(userId)).toEqual({});
    await repo.change({ userId }, "sharpe", answer(0, 1, 10), 10);
    await repo.change({ userId }, "sharpe", answer(1, 3, 11), 11);
    expect(await repo.loadForUser(userId)).toEqual({ sharpe: { answers: [1, 3, null, null], bestScore: null, total: 4, passedAt: null, updatedAt: 11 } });
  });

  it("scores a finished quiz and keeps the pass through a retry", async () => {
    for (const [i, c] of [1, 0, 2, 0].entries()) await repo.change({ userId }, "beta", answer(i, c, 20 + i), 20 + i);
    await repo.change({ userId }, "beta", (p) => ({ ok: true, progress: retry(p, 4, 30) }), 30);
    expect((await repo.loadForUser(userId)).beta).toEqual({ answers: [null, null, null, null], bestScore: 3, total: 4, passedAt: 23, updatedAt: 30 });
  });

  it("saves nothing when a change is refused", async () => {
    await repo.change({ userId }, "rsi", answer(0, 1), 1);
    const refused = await repo.change({ userId }, "rsi", answer(0, 2), 2);
    expect(refused.ok).toBe(false);
    expect((await repo.loadForUser(userId)).rsi?.answers).toEqual([1, null, null, null]);
  });

  it("doesn't lose an answer when two arrive at once", async () => {
    await Promise.all([repo.change({ userId }, "volatility", answer(0, 1), 1), repo.change({ userId }, "volatility", answer(1, 0), 1)]);
    expect((await repo.loadForUser(userId)).volatility?.answers).toEqual([1, 0, null, null]);
  });
});

describe("guest learners", () => {
  it("save progress under their own ID, invisible to anyone else", async () => {
    const guestId = await repo.createGuest(5);
    await repo.change({ guestId }, "sharpe", answer(0, 1, 6), 6);
    expect((await repo.loadGuest(guestId))?.sharpe?.answers).toEqual([1, null, null, null]);
    expect(await repo.loadForUser(userId)).toEqual({});
    expect(await repo.loadGuest("not-a-guest")).toBeNull();
    expect((await repo.change({ guestId: "not-a-guest" }, "sharpe", answer(0, 1), 1)).ok).toBe(false);
  });

  it("can't be used to reach a signed-in user's learner", async () => {
    await repo.change({ userId }, "sharpe", answer(0, 1), 1);
    const [mine] = await db.select().from(schema.learner).where(eq(schema.learner.userId, userId));
    expect(await repo.loadGuest(mine.id)).toBeNull();
    expect((await repo.change({ guestId: mine.id }, "sharpe", answer(1, 0), 2)).ok).toBe(false);
  });

  it("merge into an account on sign-in, then disappear", async () => {
    await repo.change({ userId }, "sharpe", answer(0, 1, 10), 10);
    for (const [i, c] of [1, 0, 2, 1].entries()) await repo.change({ userId }, "beta", answer(i, c, 11), 11);
    const guestId = await repo.createGuest(12);
    await repo.change({ guestId }, "sharpe", answer(0, 0, 20), 20); // newer: these answers win
    for (const [i, c] of [0, 0, 0, 0].entries()) await repo.change({ guestId }, "beta", answer(i, c, 21), 21); // worse: the account's pass stays
    await repo.change({ guestId }, "rsi", answer(2, 2, 22), 22); // only the guest has it

    const merged = await repo.mergeGuestIntoUser(guestId, userId, 30);
    expect(merged.sharpe?.answers).toEqual([0, null, null, null]);
    expect(merged.beta).toMatchObject({ bestScore: 4, passedAt: 11 });
    expect(merged.rsi?.answers).toEqual([null, null, 2, null]);
    expect(await repo.loadForUser(userId)).toEqual(merged);
    expect(await repo.loadGuest(guestId)).toBeNull();
    expect(await db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.learnerId, guestId))).toEqual([]);
  });
});
