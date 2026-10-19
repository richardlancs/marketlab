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
