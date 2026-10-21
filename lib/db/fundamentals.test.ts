import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CompanyFacts } from "../market/fundamentals";
import { createFundamentalsRepository } from "./fundamentals";
import * as schema from "./schema";

let dir: string;
let client: Client;
let repo: ReturnType<typeof createFundamentalsRepository>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-fundamentals-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  repo = createFundamentalsRepository(db);
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

const facts = (name: string): CompanyFacts => ({ cik: 1, name, years: [], trailing: null, filed: "2026-08-01" });

describe("the fundamentals repository", () => {
  it("stores, replaces and reads numbers, and remembers companies without any", async () => {
    expect(await repo.get("AAPL")).toBeUndefined();
    await repo.save("AAPL", facts("Apple"), 100);
    await repo.save("AAPL", facts("Apple Inc."), 200);
    await repo.save("TSM", null, 150);
    expect(await repo.get("AAPL")).toEqual(facts("Apple Inc."));
    expect(await repo.get("TSM")).toBeNull();
    expect([...(await repo.all()).keys()]).toEqual(["AAPL"]);
  });

  it("lists what's due: never fetched first, then the oldest", async () => {
    // TSM was fetched at 150, AAPL at 200.
    expect(await repo.due(["AAPL", "KO", "TSM"], 300)).toEqual(["KO", "TSM", "AAPL"]);
    expect(await repo.due(["AAPL", "KO", "TSM"], 175)).toEqual(["KO", "TSM"]);
    expect(await repo.due([], 300)).toEqual([]);
  });
});
