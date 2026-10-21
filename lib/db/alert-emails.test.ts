import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAlertEmailRepository } from "./alert-emails";
import * as schema from "./schema";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let repo: ReturnType<typeof createAlertEmailRepository>;
const T = 1_800_000_000_000;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-alert-emails-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  repo = createAlertEmailRepository(db);
  const person = (id: string, extra: Partial<typeof schema.user.$inferInsert> = {}) => ({ id, name: id.toUpperCase(), email: `${id}@example.com`, emailVerified: true, ...extra });
  await db.insert(schema.user).values([person("ann"), person("bob", { emailVerified: false }), person("guest", { isGuest: true }), person("cat"), person("dan")]);
  const alert = (userId: string, id: string, extra: Partial<typeof schema.priceAlert.$inferInsert> = {}) => ({
    userId,
    id,
    symbol: "KO",
    direction: "above" as const,
    price: 70,
    createdAt: T - 10,
    triggeredAt: T,
    triggerPrice: 71,
    ...extra,
  });
  await db.insert(schema.priceAlert).values([
    alert("ann", "a1"),
    alert("ann", "a2", { condition: { kind: "rsi", days: 14, level: 30 }, direction: "below" }),
    alert("ann", "a3", { triggeredAt: null, triggerPrice: null }), // not triggered
    alert("ann", "a4", { seen: true }), // already seen in the app
    alert("ann", "a5", { triggeredAt: T - 30 * 86_400_000 }), // too old
    alert("bob", "b1"), // unconfirmed address
    alert("guest", "g1"), // a guest
    alert("cat", "c1"), // hasn't turned emails on
    alert("dan", "d1"), // turned them off again
  ]);
  for (const id of ["ann", "bob", "guest"]) await repo.setEnabled(id, true);
  await repo.setEnabled("dan", true);
  await repo.setEnabled("dan", false);
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("alert email digests", () => {
  it("are due only for opted-in, confirmed, real users, with their unseen recent alerts", async () => {
    const due = await repo.due(T - 7 * 86_400_000, 100);
    expect(due.map((d) => d.userId)).toEqual(["ann"]);
    expect(due[0].alerts.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(due[0].alerts[1].condition).toEqual({ kind: "rsi", days: 14, level: 30 });
    expect(await repo.enabled("ann")).toBe(true);
    expect(await repo.enabled("cat")).toBe(false);
    expect(await repo.enabled("dan")).toBe(false);
  });

  it("go out once", async () => {
    await repo.markEmailed("ann", ["a1", "a2"], T + 1);
    expect(await repo.due(T - 7 * 86_400_000, 100)).toEqual([]);
  });
});
