import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countRequest } from "./rate-limits";
import * as schema from "./schema";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-limits-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("countRequest", () => {
  it("allows up to the limit in a window, then refuses until the window is over", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await countRequest(db, "k1", 3, 60_000, 1000 + i));
    expect(results).toEqual([true, true, true, false, false]);
    // The count stops at max + 1 instead of growing.
    const [row] = await db.select().from(schema.rateLimit).where(eq(schema.rateLimit.key, "k1"));
    expect(row).toMatchObject({ count: 4, lastRequest: 1000 });
    // A new window starts a minute after the first request.
    expect(await countRequest(db, "k1", 3, 60_000, 61_000)).toBe(true);
    const [after] = await db.select().from(schema.rateLimit).where(eq(schema.rateLimit.key, "k1"));
    expect(after).toMatchObject({ count: 1, lastRequest: 61_000 });
  });

  it("counts each key separately", async () => {
    expect(await countRequest(db, "a", 1, 60_000, 0)).toBe(true);
    expect(await countRequest(db, "b", 1, 60_000, 0)).toBe(true);
    expect(await countRequest(db, "a", 1, 60_000, 1)).toBe(false);
  });

  it("never lets simultaneous requests through past the limit", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => countRequest(db, "burst", 5, 60_000, 5000 + i)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});
