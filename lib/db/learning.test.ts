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
import { adoptLearner, createLearningRepository, mergeLearners } from "./learning";
import { writeTransaction } from "./transaction";
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

describe("lesson progress", () => {
  it("starts empty, and saves answers as they're given", async () => {
    expect(await repo.load(userId)).toEqual({});
    await repo.change(userId, "sharpe", answer(0, 1, 10), 10);
    await repo.change(userId, "sharpe", answer(1, 3, 11), 11);
    expect(await repo.load(userId)).toEqual({ sharpe: { answers: [1, 3, null, null], bestScore: null, total: 4, passedAt: null, updatedAt: 11 } });
  });

  it("scores a finished quiz and keeps the pass through a retry", async () => {
    for (const [i, c] of [1, 0, 2, 0].entries()) await repo.change(userId, "beta", answer(i, c, 20 + i), 20 + i);
    await repo.change(userId, "beta", (p) => ({ ok: true, progress: retry(p, 4, 30) }), 30);
    expect((await repo.load(userId)).beta).toEqual({ answers: [null, null, null, null], bestScore: 3, total: 4, passedAt: 23, updatedAt: 30 });
  });

  it("saves nothing when a change is refused", async () => {
    await repo.change(userId, "rsi", answer(0, 1), 1);
    const refused = await repo.change(userId, "rsi", answer(0, 2), 2);
    expect(refused.ok).toBe(false);
    expect((await repo.load(userId)).rsi?.answers).toEqual([1, null, null, null]);
  });

  it("doesn't lose an answer when two arrive at once", async () => {
    await Promise.all([repo.change(userId, "volatility", answer(0, 1), 1), repo.change(userId, "volatility", answer(1, 0), 1)]);
    expect((await repo.load(userId)).volatility?.answers).toEqual([1, 0, null, null]);
  });

  it("is separate for each user", async () => {
    await repo.change(userId, "sharpe", answer(0, 1), 1);
    const other = `${userId}-other`;
    await db.insert(schema.user).values({ id: other, name: "O", email: `${other}@example.com` });
    expect(await repo.load(other)).toEqual({});
  });
});

describe("moving progress between users", () => {
  it("merges one user's progress into another's and removes the first", async () => {
    const other = `${userId}-guest`;
    await db.insert(schema.user).values({ id: other, name: "G", email: `${other}@example.com` });
    for (const [i, c] of [1, 0, 2, 1].entries()) await repo.change(userId, "beta", answer(i, c, 11), 11);
    await repo.change(other, "sharpe", answer(0, 0, 20), 20);
    for (const [i, c] of [0, 0, 0, 0].entries()) await repo.change(other, "beta", answer(i, c, 21), 21); // worse: the pass stays

    await writeTransaction(db, (tx) => mergeLearners(tx, other, userId, 30));
    const merged = await repo.load(userId);
    expect(merged.sharpe?.answers).toEqual([0, null, null, null]);
    expect(merged.beta).toMatchObject({ bestScore: 4, passedAt: 11 });
    expect(await repo.load(other)).toEqual({});
    expect(await db.select().from(schema.learner).where(eq(schema.learner.userId, other))).toEqual([]);
  });

  it("attaches a learner from before guests were users, and only such a learner", async () => {
    const orphan = crypto.randomUUID();
    await db.insert(schema.learner).values({ id: orphan, userId: null, createdAt: 1, updatedAt: 1 });
    await db.insert(schema.lessonProgress).values({ learnerId: orphan, term: "rsi", answers: "[1,null,null,null]", total: 4, bestScore: null, passedAt: null, updatedAt: 5 });
    await writeTransaction(db, (tx) => adoptLearner(tx, orphan, userId, 6));
    expect((await repo.load(userId)).rsi?.answers).toEqual([1, null, null, null]);

    // A learner that already belongs to someone can't be taken.
    const thief = `${userId}-thief`;
    await db.insert(schema.user).values({ id: thief, name: "T", email: `${thief}@example.com` });
    const [mine] = await db.select().from(schema.learner).where(eq(schema.learner.userId, userId));
    await writeTransaction(db, (tx) => adoptLearner(tx, mine.id, thief, 7));
    expect(await repo.load(thief)).toEqual({});
    expect((await repo.load(userId)).rsi).toBeDefined();
  });
});
