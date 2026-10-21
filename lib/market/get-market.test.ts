// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Next's cache functions only work inside Next; here they're spies, so the
// tests can check which cache lifetime each path chooses.
const cacheLife = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ cacheLife, cacheTag: vi.fn() }));
vi.mock("server-only", () => ({}));

const { getMarket } = await import("./index");
const { clearTiingoMemo } = await import("./tiingo");

beforeEach(() => {
  // Each test chooses its data source; nothing from the shell (or CI) may decide it for them.
  for (const name of ["MARKET_DATA_SOURCE", "MARKET_DATA_PRIVATE", "VERCEL_ENV"]) vi.stubEnv(name, undefined);
  cacheLife.mockClear();
  clearTiingoMemo();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getMarket", () => {
  it("uses the mock market when no API key is set, cached for hours", async () => {
    vi.stubEnv("TIINGO_API_KEY", "");
    const market = await getMarket();
    expect(market).toMatchObject({ source: "mock", notice: null });
    expect(cacheLife).toHaveBeenCalledWith("hours");
  });

  it("can be forced to the mock market even with a key", async () => {
    vi.stubEnv("TIINGO_API_KEY", "a-key");
    vi.stubEnv("MARKET_DATA_SOURCE", "mock");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await getMarket()).source).toBe("mock");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to mock data with a notice when Tiingo fails, and retries soon", async () => {
    vi.stubEnv("TIINGO_API_KEY", "bad-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const market = await getMarket();
    expect(market.source).toBe("mock");
    expect(market.notice).toMatch(/unavailable/);
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Falling back"), expect.stringContaining("key was rejected"));
  });
});

describe("getStockDetail", () => {
  it("serves core stocks from the shared snapshot and catalog stocks from their own cache", async () => {
    vi.stubEnv("TIINGO_API_KEY", "");
    const { getStockDetail } = await import("./index");
    expect(await getStockDetail("aapl")).toMatchObject({ status: "ok", stock: { symbol: "AAPL", sector: "Technology" } });
    expect(await getStockDetail("KO")).toMatchObject({ status: "ok", stock: { symbol: "KO", name: "Coca-Cola Co." } });
    expect(await getStockDetail("ZZZZ")).toBeNull();
    expect(await getStockDetail("../x")).toBeNull();
  });

  it("never shows mock prices for a real ticker when Tiingo fails", async () => {
    vi.stubEnv("TIINGO_API_KEY", "a-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const { getStockDetail } = await import("./index");
    cacheLife.mockClear();
    expect(await getStockDetail("KO")).toEqual({ status: "unavailable", listing: { symbol: "KO", name: "Coca-Cola Co.", sector: "Consumer Staples" } });
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("calls a ticker unavailable, not unknown, when it can't be looked up", async () => {
    vi.stubEnv("TIINGO_API_KEY", "a-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { getStockDetail, getListing } = await import("./index");
    expect(await getStockDetail("ROKU")).toEqual({ status: "unavailable", listing: { symbol: "ROKU", name: "ROKU", sector: null } });
    expect(await getListing("ROKU")).toBeNull();
  });

  it("caches 'no such ticker' for days", async () => {
    vi.stubEnv("TIINGO_API_KEY", "a-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const { getListing } = await import("./index");
    expect(await getListing("ZZZZ")).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("days");
  });

  it("ignores the key on a public Vercel deployment", async () => {
    vi.stubEnv("TIINGO_API_KEY", "a-key");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await getMarket()).source).toBe("mock");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
