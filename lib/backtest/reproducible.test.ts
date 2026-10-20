// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG_VERSION, runConfig, type BacktestConfig } from "./config";
import { canonicalJson, checksumOf, describeSnapshot, makeSnapshot, parseSnapshot } from "./snapshot";
import { compareResults } from "./stored";

// The engines and the Python client are server modules; here they're plain code.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
const { compute, configuredEngine, engineFor } = await import("./engines");
const { PythonEngineError, runOnPython } = await import("./python-client");

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5, 20);
const points = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ time: T0 + i * DAY, price: f(i) }));
const history = { AAPL: points(80, (i) => 100 + i + (i % 5)), KO: points(80, (i) => 50 + (i % 7)) };
const market = { symbol: "SPX", name: "S&P 500", history: points(80, (i) => 5000 + 3 * i) };

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

  it("give the same result as the engine on the full history", async () => {
    const snap = makeSnapshot(config(), history, market, "mock", T0);
    const fromSnapshot = await compute(config(), snap, "typescript");
    expect(fromSnapshot.outcome).toEqual(runConfig(config(), history, market.history));
  });
});

describe("choosing an engine", () => {
  it("defaults to TypeScript, and ignores unknown values", () => {
    vi.stubEnv("BACKTEST_ENGINE", "");
    expect(configuredEngine()).toBe("typescript");
    vi.stubEnv("BACKTEST_ENGINE", "fortran");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(configuredEngine()).toBe("typescript");
  });

  it("sends only the strategies Python implements to Python", () => {
    expect(engineFor(config(), "python")).toBe("python");
    expect(engineFor(config({ strategy: { kind: "buy-and-hold" } }), "python")).toBe("python");
    expect(engineFor(config({ strategy: { kind: "rebalancing", frequency: "monthly" } }), "python")).toBe("typescript");
    expect(engineFor(config({ strategy: { kind: "dollar-cost-averaging", installments: 6 } }), "python")).toBe("typescript");
    expect(engineFor(config(), "typescript")).toBe("typescript");
  });

  it("labels TypeScript results, and explains a crossover that never warmed up", async () => {
    const snap = makeSnapshot(config({ strategy: { kind: "moving-average", fast: 50, slow: 100 } }), history, market, "mock", T0);
    const result = await compute(config({ strategy: { kind: "moving-average", fast: 50, slow: 100 } }), snap, "typescript");
    expect(result.engine).toEqual({ name: "typescript", version: "1.0.0" });
    expect(result.warnings[0]).toMatch(/never traded/);
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
    await expect(runOnPython(config(), snap)).rejects.toThrow(/not set up/);
  });

  it("sends the token and the server's prices, and reads a good answer", async () => {
    configured();
    const run = runConfig(config(), { AAPL: history.AAPL }, []);
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

  it("explains a timeout and an unreachable service, and never falls back", async () => {
    configured();
    quiet();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }))));
    await expect(compute(config(), snap, "python")).rejects.toThrow(PythonEngineError);
    await expect(runOnPython(config(), snap)).rejects.toThrow(/didn't answer within 10 seconds/);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(runOnPython(config(), snap)).rejects.toThrow(/couldn't be reached/);
  });
});

describe("comparing a reproduced result with the stored one", () => {
  const outcome = runConfig(config(), history, market.history);

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
