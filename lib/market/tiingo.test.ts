import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearTiingoMemo, createTiingoProvider, parseTiingoPrices } from "./tiingo";

// A trimmed sample in the shape Tiingo's /tiingo/daily/<ticker>/prices returns.
const SAMPLE = [
  {
    date: "2026-10-15T00:00:00.000Z",
    close: 245.91,
    high: 247.0,
    low: 243.1,
    open: 244.2,
    volume: 48211000,
    adjClose: 245.91,
    adjHigh: 247.0,
    adjLow: 243.1,
    adjOpen: 244.2,
    adjVolume: 48211000,
    divCash: 0,
    splitFactor: 1,
  },
  {
    date: "2026-10-16T00:00:00.000Z",
    close: 248.3,
    high: 249.12,
    low: 245.5,
    open: 246.0,
    volume: 51023000,
    adjClose: 248.3,
    adjHigh: 249.12,
    adjLow: 245.5,
    adjOpen: 246.0,
    adjVolume: 51023000,
    divCash: 0,
    splitFactor: 1,
  },
];

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

beforeEach(() => clearTiingoMemo());

describe("parseTiingoPrices", () => {
  it("maps rows to bars at the New York close, oldest first", () => {
    const bars = parseTiingoPrices([...SAMPLE].reverse());
    expect(bars.map((b) => new Date(b.time).toISOString())).toEqual(["2026-10-15T20:00:00.000Z", "2026-10-16T20:00:00.000Z"]);
    expect(bars[1]).toMatchObject({ open: 246, high: 249.12, low: 245.5, close: 248.3, adjClose: 248.3, volume: 51023000 });
  });

  it("keeps adjusted closes separate from raw ones (e.g. after a dividend)", () => {
    const rows = [{ ...SAMPLE[0], adjClose: 240.1 }, SAMPLE[1]];
    expect(parseTiingoPrices(rows)[0]).toMatchObject({ close: 245.91, adjClose: 240.1 });
  });

  it("drops malformed rows rather than trusting them", () => {
    const rows = [SAMPLE[0], { ...SAMPLE[1], date: "2026-10-17T00:00:00.000Z", close: null }, SAMPLE[1], "junk"];
    expect(parseTiingoPrices(rows)).toHaveLength(2);
  });

  it("rejects responses that aren't usable", () => {
    expect(() => parseTiingoPrices({ detail: "Not found" })).toThrow(/not a list/);
    expect(() => parseTiingoPrices([SAMPLE[0]])).toThrow(/too little/);
  });
});

describe("Tiingo provider", () => {
  const now = Date.UTC(2026, 9, 19, 22);

  it("sends the key in a header, not the URL, and asks for 5+ years", async () => {
    const fetchImpl = respond(200, SAMPLE);
    await createTiingoProvider("secret-key", fetchImpl).getSeries("AAPL", now);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.tiingo.com/tiingo/daily/AAPL/prices?startDate=2021-10-05");
    expect(url).not.toContain("secret-key");
    expect(init.headers.Authorization).toBe("Token secret-key");
  });

  it("has no fundamentals, and shows funds for indices", async () => {
    const provider = createTiingoProvider("k", respond(200, SAMPLE));
    expect(await provider.getSeries("AAPL", now)).toMatchObject({ marketCap: null, peRatio: null });
    expect(provider.indexSymbol({ symbol: "SPX", name: "S&P 500", fund: "SPY" })).toBe("SPY");
  });

  it("reuses a response for an hour, then fetches again", async () => {
    const fetchImpl = respond(200, SAMPLE);
    const provider = createTiingoProvider("k", fetchImpl);
    await provider.getSeries("AAPL", now);
    await provider.getSeries("AAPL", now + 30 * 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await provider.getSeries("AAPL", now + 61 * 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, /key was rejected/],
    [429, /request limit/],
    [500, /HTTP 500/],
  ])("explains a %i response", async (status, message) => {
    await expect(createTiingoProvider("k", respond(status, { detail: "x" })).getSeries("AAPL", now)).rejects.toThrow(message);
  });
});

describe("Tiingo listings", () => {
  const now = Date.UTC(2026, 9, 19, 22);

  it("uses the catalog's name without a request", async () => {
    const fetchImpl = respond(200, {});
    expect(await createTiingoProvider("k", fetchImpl).getListing("KO")).toMatchObject({ name: "Coca-Cola Co.", sector: "Consumer Staples" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("looks up other tickers once, and remembers unknown ones", async () => {
    const found = respond(200, { ticker: "ROKU", name: "Roku Inc", exchangeCode: "NASDAQ" });
    const provider = createTiingoProvider("k", found);
    expect(await provider.getListing("ROKU")).toEqual({ symbol: "ROKU", name: "Roku Inc", sector: null });
    await provider.getListing("ROKU");
    expect(found).toHaveBeenCalledTimes(1);
    expect((found as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("https://api.tiingo.com/tiingo/daily/ROKU");

    const missing = respond(404, { detail: "Not found." });
    const other = createTiingoProvider("k", missing);
    expect(await other.getListing("ZZZZ")).toBeNull();
    expect(await other.getListing("ZZZZ")).toBeNull();
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it("stops asking for extra tickers when the budget runs low, but keeps core ones going", async () => {
    const fetchImpl = respond(200, SAMPLE);
    const provider = createTiingoProvider("k", fetchImpl);
    // 32 = 45 an hour minus 13 kept for the dashboard.
    for (let i = 0; i < 32; i++) await provider.getSeries(`X${i}`, now);
    await expect(provider.getSeries("ROKU", now)).rejects.toThrow(/budget/);
    await expect(provider.getSeries("AAPL", now)).resolves.toBeTruthy();
  });

  it("pauses everything for an hour after a 429", async () => {
    const provider = createTiingoProvider("k", respond(429, { detail: "x" }));
    await expect(provider.getSeries("AAPL", now)).rejects.toThrow(/request limit/);
    await expect(createTiingoProvider("k", respond(200, SAMPLE)).getSeries("MSFT", now)).rejects.toThrow(/budget/);
  });
});
