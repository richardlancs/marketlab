// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG_VERSION, type BacktestConfig, type BacktestOutcome } from "./config";
import { runBacktest } from "./engine";
import { canonicalJson, checksumOf, describeSnapshot, makeSnapshot, parseSnapshot } from "./snapshot";
import { buyAndHold, movingAverageCrossover } from "./strategies";
import { compareResults } from "./stored";

// The engines and the Python client are server modules; here they're plain code.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
const { compute } = await import("./engines");
const { PythonEngineError, reproducePythonRun, runOnPython, savePythonRun } = await import("./python-client");

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5, 20);
const points = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ time: T0 + i * DAY, price: f(i) }));
const history = { AAPL: points(80, (i) => 100 + i + (i % 5)), KO: points(80, (i) => 50 + (i % 7)) };
const market = { symbol: "SPX", name: "S&P 500", history: points(80, (i) => 5000 + 3 * i) };

/** A real outcome to send back from a mocked service: the Learn demos' engine, on the same prices. */
function outcomeOf(cfg: BacktestConfig, prices: Record<string, { time: number; price: number }[]>): BacktestOutcome {
  const series = cfg.holdings.map((h) => ({ symbol: h.symbol, points: prices[h.symbol] }));
  const options = { start: cfg.start, end: cfg.end, initialCash: cfg.initialCash, costs: cfg.costs };
  const weights = Object.fromEntries(cfg.holdings.map((h) => [h.symbol, h.weight]));
  const run = runBacktest(series, cfg.strategy.kind === "moving-average" ? movingAverageCrossover(weights, cfg.strategy.fast, cfg.strategy.slow) : buyAndHold(weights), options);
  return { run, benchmark: runBacktest(series, buyAndHold(weights), { ...options, start: run.equity[0].time, end: run.equity.at(-1)!.time }) };
}

const config = (overrides: Partial<BacktestConfig> = {}): BacktestConfig => ({
  version: CONFIG_VERSION,
  holdings: [{ symbol: "AAPL", weight: 1 }],
  strategy: { kind: "moving-average", fast: 5, slow: 20 },
  start: T0 + 10 * DAY,
  end: T0 + 70 * DAY,
  initialCash: 10_000,
  costs: { commission: 1, slippageBps: 5 },
  benchmark: "same-stocks",
  ...overrides,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("price snapshots", () => {
  it("hold only the run's window, and the market only when it's the benchmark", () => {
    const snap = makeSnapshot(config(), history, market, "mock", T0);
    expect(snap.series.AAPL.times[0]).toBe(T0 + 10 * DAY);
    expect(snap.series.AAPL.times.at(-1)).toBe(T0 + 70 * DAY);
    expect(snap.series.KO).toBeUndefined();
    expect(snap.market).toBeNull();
    expect(makeSnapshot(config({ benchmark: "market" }), history, market, "mock", T0).market?.symbol).toBe("SPX");
    expect(snap.simulated).toBe(true);
  });

  it("have a checksum that depends on the data, not on key order", () => {
    const snap = makeSnapshot(config(), history, market, "mock", T0);
    const reordered = JSON.parse(canonicalJson(snap));
    expect(checksumOf(reordered)).toBe(checksumOf(snap));
    const changed = structuredClone(snap);
    changed.series.AAPL.prices[3] += 0.0001;
    expect(checksumOf(changed)).not.toBe(checksumOf(snap));
    expect(describeSnapshot(snap)).toMatchObject({ datasetVersion: `mock:${checksumOf(snap).slice(0, 12)}`, observations: 61, simulated: true });
  });

  it("are checked when read back", () => {
    const snap = makeSnapshot(config(), history, market, "tiingo", T0);
    expect(parseSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    expect(parseSnapshot({ ...snap, version: 2 })).toBeNull();
    expect(parseSnapshot({ ...snap, series: { AAPL: { times: [1], prices: [] } } })).toBeNull();
  });
});

describe("the Python client", () => {
  const snap = makeSnapshot(config(), history, market, "mock", T0);
  const configured = () => {
    vi.stubEnv("ANALYTICS_URL", "http://analytics.test");
    vi.stubEnv("ANALYTICS_SERVICE_TOKEN", "secret");
  };
  const reply = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

  it("refuses when it isn't set up", async () => {
    vi.stubEnv("ANALYTICS_URL", "");
    await expect(runOnPython(config(), snap)).rejects.toThrow(/isn't set up/);
  });

  it("sends the token and the server's prices, and reads a good answer", async () => {
    configured();
    const run = outcomeOf(config(), history);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ engine: { name: "python", version: "1.0.0" }, run: run.run, benchmark: run.benchmark, warnings: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runOnPython(config(), snap);
    expect(result.outcome.run.metrics.finalValue).toBe(run.run.metrics.finalValue);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://analytics.test/v1/backtests");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    expect(JSON.parse(String(init.body)).prices.AAPL.prices).toEqual(snap.series.AAPL.prices);
  });

  it.each([
    [422, { error: "Invalid backtest request.", problems: ["config.strategy: too short"] }, /refused these settings: config.strategy: too short/],
    [401, { error: "Missing or wrong service token." }, /service token/],
    [500, { error: "boom" }, /failed \(500\)/],
    [200, { engine: { name: "python", version: "1" }, run: { equity: "nope" } }, /couldn't read/],
  ])("explains a %i answer", async (status, body, message) => {
    configured();
    quiet();
    reply(status, body);
    await expect(runOnPython(config(), snap)).rejects.toThrow(message);
  });

  it("explains a timeout and an unreachable service (after one retry)", async () => {
    configured();
    quiet();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }))));
    await expect(compute(config(), snap)).rejects.toThrow(PythonEngineError);
    await expect(runOnPython(config(), snap)).rejects.toThrow(/didn't answer within 10 seconds/);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(runOnPython(config(), snap)).rejects.toThrow(/starting up or unavailable/);
  });
});

describe("saving and reproducing through the Python service", () => {
  const snap = makeSnapshot(config(), history, market, "mock", T0);
  const outcome = outcomeOf(config(), history);
  const result = {
    outcome,
    note: null,
    provenance: { engine: { name: "python", version: "1.0.0" }, dataset: { ...describeSnapshot(snap) }, assumptions: {}, computedAt: 1 },
  };
  const configured = () => {
    vi.stubEnv("ANALYTICS_URL", "http://analytics.test/");
    vi.stubEnv("ANALYTICS_SERVICE_TOKEN", "secret");
  };

  it("sends the verified owner and reads the saved result back", async () => {
    configured();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ summary: { finalValue: 1, totalReturn: 0, cagr: 0, maxDrawdown: 0, benchmarkTotalReturn: 0 }, result })));
    vi.stubGlobal("fetch", fetchMock);
    const saved = await savePythonRun({ ownerId: "user-1", run: { id: "r", name: "n", createdAt: 1 }, config: config(), snapshot: snap, dataset: result.provenance.dataset, note: null, assumptions: {} });
    expect(saved.result.provenance.engine.name).toBe("python");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://analytics.test/v1/saved-runs");
    expect(JSON.parse(String(init.body)).ownerId).toBe("user-1");
  });

  it("passes on the service's own messages, and refuses an unreadable answer", async () => {
    configured();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "That saved run doesn't exist." }), { status: 404 })));
    await expect(reproducePythonRun("r", "user-1")).rejects.toThrow("That saved run doesn't exist.");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reproduced: {}, comparison: {} }))));
    await expect(reproducePythonRun("r", "user-1")).rejects.toThrow(PythonEngineError);
  });
});

describe("comparing a reproduced result with the stored one", () => {
  const outcome = outcomeOf(config(), history);

  it("finds identical results identical", () => {
    expect(compareResults(outcome, structuredClone(outcome))).toEqual({ matches: true, largestDifference: 0, differences: [] });
  });

  it("reports what differs", () => {
    const changed = structuredClone(outcome);
    changed.run.equity[5].price += 1;
    changed.run.metrics.finalValue += 1;
    const result = compareResults(outcome, changed);
    expect(result.matches).toBe(false);
    expect(result.differences.join(" ")).toMatch(/value on day 6/);
  });
});

describe("snapshots with daily bars", () => {
  it("leave every other snapshot exactly as before, so their checksums don't change", async () => {
    const { makeSnapshot, checksumOf } = await import("./snapshot");
    const points = [1, 2, 3].map((d) => ({ time: d * 86_400_000, price: 100 + d }));
    const cfg = { version: 2, holdings: [{ symbol: "A", weight: 1 }], strategy: { kind: "buy-and-hold" as const }, start: 0, end: 10 * 86_400_000, initialCash: 1000, costs: { commission: 0, slippageBps: 0 }, benchmark: "same-stocks" as const };
    const plain = makeSnapshot(cfg, { A: points }, { symbol: "SPX", name: "S&P 500", history: points }, "mock", 1);
    expect(Object.keys(plain.series.A)).toEqual(["times", "prices"]);
    const withBars = makeSnapshot(cfg, { A: points }, { symbol: "SPX", name: "S&P 500", history: points }, "mock", 1, { A: points.map((p) => ({ time: p.time, high: p.price + 1, low: p.price - 1, volume: 5 })) });
    expect(withBars.series.A.high).toEqual([102, 103, 104]);
    expect(checksumOf(plain)).not.toBe(checksumOf(withBars));
  });
});
