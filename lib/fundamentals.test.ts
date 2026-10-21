// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { FundamentalsDeps } from "./fundamentals";
import type { CompanyFacts } from "./market/fundamentals";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("./db", () => ({ fundamentals: {} }));
vi.mock("./market", () => ({ fetchCompanyFacts: vi.fn() }));

const { refreshFundamentals, REFRESH_AFTER } = await import("./fundamentals");
const facts = { cik: 1, name: "X", years: [], trailing: null, filed: "2026-08-01" } as CompanyFacts;

function deps(due: string[], { tick = 10, fail = [] as string[], none = [] as string[] } = {}) {
  let clock = 1_000_000;
  const saved: [string, CompanyFacts | null][] = [];
  const d: FundamentalsDeps = {
    now: () => clock,
    due: vi.fn(async () => due),
    fetch: vi.fn(async (symbol: string) => {
      clock += tick;
      return fail.includes(symbol) ? "failed" : none.includes(symbol) ? null : facts;
    }),
    save: vi.fn(async (symbol, f) => void saved.push([symbol, f])),
  };
  return { d, saved };
}

describe("refreshFundamentals", () => {
  it("asks for catalog companies not fetched for a week, and stores each", async () => {
    const { d, saved } = deps(["AAPL", "TSM", "KO", "BAD"], { none: ["TSM"], fail: ["BAD"] });
    expect(await refreshFundamentals(Infinity, { deps: d })).toEqual({ updated: 2, none: 1, failed: 1, remaining: 1 });
    const [symbols, before] = vi.mocked(d.due).mock.calls[0];
    expect(symbols).toContain("AAPL");
    expect(before).toBe(1_000_000 - REFRESH_AFTER);
    // A failure isn't stored, so it's tried again tomorrow; "no numbers" is.
    expect(saved.map(([s, f]) => [s, f === null])).toEqual(expect.arrayContaining([["TSM", true], ["AAPL", false], ["KO", false]]));
    expect(saved).toHaveLength(3);
  });

  it("stops at the limit, and before a fetch that wouldn't finish in time", async () => {
    const many = Array.from({ length: 50 }, (_, i) => `S${i}`);
    expect(await refreshFundamentals(Infinity, { limit: 5, deps: deps(many).d })).toMatchObject({ updated: 5, remaining: 45 });
    // Each fetch takes 1s; three run at once; 3.5s allows one round, and the next would overrun.
    const { d } = deps(many, { tick: 1000 });
    const summary = await refreshFundamentals(1_000_000 + 3_500, { deps: d });
    expect(summary.updated).toBeLessThan(10);
    expect(summary.updated).toBeGreaterThan(0);
    expect(summary.remaining).toBe(50 - summary.updated);
  });
});
