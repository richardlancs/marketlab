// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPushRepository } from "./push";
import * as schema from "./schema";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let repo: ReturnType<typeof createPushRepository>;
const T = 1_800_000_000_000;
const device = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: `key-${n}`, auth: `auth-${n}` });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-push-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  repo = createPushRepository(db);
  const person = (id: string, extra: Partial<typeof schema.user.$inferInsert> = {}) => ({ id, name: id, email: `${id}@example.com`, ...extra });
  await db.insert(schema.user).values([person("ann"), person("guest", { isGuest: true }), person("cat"), person("eve")]);
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
    alert("ann", "a5", { triggeredAt: T - 5 * 86_400_000 }), // too old
    alert("guest", "g1"), // guests get them too
    alert("cat", "c1"), // no device
  ]);
  await repo.add("ann", device("phone"), 10, T - 3);
  await repo.add("ann", device("laptop"), 10, T - 2);
  await repo.add("guest", device("tablet"), 10, T - 1);
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("push devices", () => {
  it("belong to one person; a browser that changes hands moves with it", async () => {
    expect(await repo.get("ann", device("phone").endpoint)).toEqual(device("phone"));
    expect(await repo.get("cat", device("phone").endpoint)).toBeNull();
    await repo.add("eve", device("shared"), 10, T);
    await repo.add("cat", { ...device("shared"), p256dh: "new-key" }, 10, T);
    expect(await repo.get("eve", device("shared").endpoint)).toBeNull();
    expect(await repo.get("cat", device("shared").endpoint)).toMatchObject({ p256dh: "new-key" });
    await repo.removeFor("eve", device("shared").endpoint); // someone else's: nothing happens
    expect(await repo.get("cat", device("shared").endpoint)).not.toBeNull();
    await repo.removeFor("cat", device("shared").endpoint);
    expect(await repo.get("cat", device("shared").endpoint)).toBeNull();
  });

  it("are capped per person, the oldest going first", async () => {
    for (let i = 0; i < 4; i++) await repo.add("eve", device(`e${i}`), 3, T + i);
    expect(await repo.get("eve", device("e0").endpoint)).toBeNull();
    for (const n of ["e1", "e2", "e3"]) expect(await repo.get("eve", device(n).endpoint)).not.toBeNull();
  });
});

describe("pushes due", () => {
  it("are each person's unseen recent alerts, with every device they have", async () => {
    const due = await repo.due(T - 2 * 86_400_000, 100);
    expect(due.map((d) => d.userId)).toEqual(["ann", "guest"]);
    expect(due[0].alerts.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(due[0].alerts[1]).toMatchObject({ condition: { kind: "rsi", days: 14, level: 30 }, triggerPrice: 71 });
    expect(due[0].devices.map((d) => d.endpoint).sort()).toEqual([device("laptop").endpoint, device("phone").endpoint]);
    expect(await repo.due(T - 2 * 86_400_000, 1)).toHaveLength(1);
  });

  it("go out once, and forget devices that are gone", async () => {
    await repo.markPushed("ann", ["a1", "a2"], T + 1);
    await repo.remove([device("tablet").endpoint]);
    expect(await repo.due(T - 2 * 86_400_000, 100)).toEqual([]);
  });
});
