import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DailyBar } from "../types";
import { barsChecksum, createPriceRepository } from "./prices";
import * as schema from "./schema";

let dir: string;
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let repo: ReturnType<typeof createPriceRepository>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "marketlab-prices-"));
  client = createClient({ url: `file:${join(dir, "test.db")}`, timeout: 5000 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  repo = createPriceRepository(db);
});
afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

const DAY = 86_400_000;
const bar = (i: number, close: number, adjClose = close): DailyBar => ({ time: i * DAY, open: close, high: close + 1, low: close - 1, close, adjClose, volume: 1000 + i });
const series = (n: number) => Array.from({ length: n }, (_, i) => bar(i + 1, 100 + i));

describe("the price store", () => {
  it("stores a series once, then leaves it alone while it's unchanged", async () => {
    expect(await repo.syncSeries("mock", "AAA", series(1200))).toBe("rewritten");
    expect(await repo.syncSeries("mock", "AAA", series(1200))).toBe("unchanged");
    expect(await repo.bars("mock", "AAA")).toHaveLength(1200);
    expect((await repo.seriesIndex("mock")).get("AAA")).toEqual({ checksum: barsChecksum(series(1200)), lastTime: 1200 * DAY, bars: 1200, marketCap: null, peRatio: null, dividendYield: null });
    await repo.syncSeries("mock", "AAA", series(1201), { marketCap: 5e9, peRatio: 21.5, dividendYield: 0.012 });
    expect((await repo.seriesIndex("mock")).get("AAA")).toMatchObject({ marketCap: 5e9, peRatio: 21.5, dividendYield: 0.012 });
  });

  it("appends new days without rewriting the past", async () => {
    expect(await repo.syncSeries("mock", "BBB", series(10))).toBe("rewritten");
    expect(await repo.syncSeries("mock", "BBB", series(13))).toBe("appended");
    const stored = await repo.bars("mock", "BBB");
    expect(stored.map((b) => b.close)).toEqual(series(13).map((b) => b.close));
    expect(await repo.bars("mock", "BBB", 11 * DAY)).toHaveLength(2);
  });

  it("rewrites the series when the past changes (a dividend rescales adjusted closes)", async () => {
    await repo.syncSeries("mock", "CCC", series(10));
    const adjusted = series(11).map((b, i) => (i < 10 ? { ...b, adjClose: b.close * 0.99 } : b));
    expect(await repo.syncSeries("mock", "CCC", adjusted)).toBe("rewritten");
    const stored = await repo.bars("mock", "CCC");
    expect(stored).toHaveLength(11);
    expect(stored[0].adjClose).toBeCloseTo(99);
  });

  it("keeps sources apart", async () => {
    await repo.syncSeries("tiingo", "AAA", series(5));
    expect(await repo.bars("tiingo", "AAA")).toHaveLength(5);
    expect(await repo.bars("mock", "AAA")).toHaveLength(1201);
  });
});

describe("stored analytics results", () => {
  it("reads results, skipping ones that don't parse", async () => {
    const row = (subject: string, result: string) => ({ kind: "test", subject, source: "mock", version: "1", inputChecksum: "x", asOf: 5, result, computedAt: 6 });
    await db.insert(schema.analyticsResult).values([row("AAA", JSON.stringify({ value: 1 })), row("BBB", "not json"), row("CCC", JSON.stringify({ other: 1 }))]);
    const parse = (v: unknown) => (typeof (v as { value?: unknown })?.value === "number" ? (v as { value: number }) : null);
    expect(await repo.result("test", "AAA", "mock", parse)).toEqual({ version: "1", inputChecksum: "x", asOf: 5, computedAt: 6, result: { value: 1 } });
    expect(await repo.result("test", "BBB", "mock", parse)).toBeNull();
    expect([...(await repo.results("test", "mock", parse)).keys()]).toEqual(["AAA"]);
  });
});
