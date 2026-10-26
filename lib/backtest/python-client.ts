/**
 * Calls the Python analytics service (services/analytics): to calculate a
 * backtest, and to save and reproduce runs of its own (it reads and writes
 * the database for those). Server-only: it holds the service token, and only the Next.js
 * server's own prices are ever sent.
 *
 * Settings, from the environment:
 * - ANALYTICS_URL: the service's base URL (http://127.0.0.1:8000 locally;
 *   on Vercel, injected by the service binding).
 * - ANALYTICS_SERVICE_TOKEN: the shared secret the service checks.
 * - ANALYTICS_TIMEOUT_MS: how long to wait, 10 seconds by default.
 *
 * Every failure becomes a PythonEngineError with a message fit to show;
 * nothing here falls back to the TypeScript engine.
 */
import "server-only";
import { cacheLife } from "next/cache";
import type { BacktestConfig, BacktestOutcome, RunSummary } from "./config";
import type { BacktestRun, BacktestTrade, Metrics } from "./engine";
import { parseExtras, type ResultExtras } from "./extras";
import { parseLuck, type LuckResult } from "./luck";
import type { PriceSnapshot } from "./snapshot";
import type { SelectionCheck } from "./sweep";
import { parseStoredResult, type Comparison, type StoredResult } from "./stored";

export class PythonEngineError extends Error {}

/** What every caller shows when the service can't be reached at all, even after a retry. */
export const SERVICE_DOWN = "The analytics service is starting up or unavailable. Try again in a moment.";

/** The service's own limit, mirrored here so an oversized request fails before it's sent. */
const MAX_POINTS = 4000;

export interface PythonResult {
  outcome: BacktestOutcome;
  engine: { name: string; version: string };
  warnings: string[];
  extras: ResultExtras | null;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Checks the service's answer field by field rather than trusting it. */
function parseRun(value: unknown): BacktestRun | null {
  const v = value as { equity?: unknown; trades?: unknown; metrics?: Record<string, unknown> } | null;
  if (!v || !Array.isArray(v.equity) || !Array.isArray(v.trades) || !v.metrics) return null;
  const equity = v.equity as { time?: unknown; price?: unknown }[];
  if (equity.length < 2 || !equity.every((p) => Number.isInteger(p.time) && isNumber(p.price))) return null;
  const trades = v.trades as Record<string, unknown>[];
  if (!trades.every((t) => Number.isInteger(t.time) && typeof t.symbol === "string" && (t.side === "buy" || t.side === "sell") && isNumber(t.shares) && isNumber(t.price) && isNumber(t.commission))) return null;
  const m = v.metrics;
  const numbers = ["finalValue", "totalReturn", "cagr", "maxDrawdown", "volatility", "exposure"];
  if (!numbers.every((k) => isNumber(m[k])) || !Number.isInteger(m.trades)) return null;
  if (!(m.sharpe === null || isNumber(m.sharpe))) return null;
  if (![m.drawdownPeak, m.drawdownTrough].every((t) => t === null || Number.isInteger(t))) return null;
  return {
    equity: equity.map((p) => ({ time: p.time as number, price: p.price as number })),
    trades: trades as unknown as BacktestTrade[],
    metrics: m as unknown as Metrics,
  };
}

export function pythonConfigured(): boolean {
  return !!process.env.ANALYTICS_URL && !!process.env.ANALYTICS_SERVICE_TOKEN;
}

const serviceUrl = (path: string) => {
  const base = process.env.ANALYTICS_URL as string;
  return new URL(path, base.endsWith("/") ? base : `${base}/`);
};

/**
 * The Python engine's version, from its /health endpoint, remembered for a
 * minute. It's part of each result's cache key, so a new engine version is
 * used as soon as it's deployed; an unreachable service fails here, fast.
 */
export async function pythonEngineVersion(): Promise<string> {
  if (!pythonConfigured()) throw new PythonEngineError("The analytics service isn't set up on this server (ANALYTICS_URL and ANALYTICS_SERVICE_TOKEN).");
  return healthVersion(process.env.ANALYTICS_URL as string);
}

async function healthVersion(base: string): Promise<string> {
  "use cache";
  cacheLife("minutes");
  void base; // part of the cache key, so another service URL is asked again
  let body: { engine?: { version?: unknown } } | null = null;
  // A quick try, then a patient one: a service waking from idle can take several seconds.
  for (const wait of [3000, 12_000]) {
    try {
      const response = await fetch(serviceUrl("health"), { signal: AbortSignal.timeout(wait), cache: "no-store" });
      body = response.ok ? await response.json() : null;
    } catch (error) {
      console.error("[analytics] health check failed:", error instanceof Error ? error.message : error);
    }
    if (typeof body?.engine?.version === "string") break;
  }
  if (typeof body?.engine?.version !== "string") throw new PythonEngineError(SERVICE_DOWN);
  return body.engine.version;
}

export async function runOnPython(config: BacktestConfig, snapshot: PriceSnapshot): Promise<PythonResult> {
  const series = [...Object.values(snapshot.series), ...(snapshot.market ? [snapshot.market.data] : [])];
  if (series.some((s) => s.times.length > MAX_POINTS)) throw new PythonEngineError(`The Python engine takes at most ${MAX_POINTS} daily prices per stock. Choose a shorter period.`);

  const body = await post("v1/backtests", { config, prices: snapshot.series, market: snapshot.market?.data ?? null }, "Backtest");
  const run = parseRun(body?.run);
  const benchmark = parseRun(body?.benchmark);
  const engine = body?.engine as { name?: unknown; version?: unknown } | undefined;
  if (!run || !benchmark || typeof engine?.name !== "string" || typeof engine.version !== "string") {
    throw new PythonEngineError("The Python engine sent back an answer MarketLab couldn't read.");
  }
  const warnings = Array.isArray(body?.warnings) ? (body.warnings as unknown[]).filter((w): w is string => typeof w === "string") : [];
  return { outcome: { run, benchmark }, engine: { name: engine.name, version: engine.version }, warnings, extras: parseExtras(body.extras) };
}

/** More measures and period returns for a finished result: for results saved before they came with every run. */
export async function analyseOnPython(outcome: BacktestOutcome, costs: BacktestConfig["costs"]): Promise<ResultExtras | null> {
  const data = await post("v1/backtests/analyse", { run: outcome.run, benchmark: outcome.benchmark, costs }, "Analyse");
  return parseExtras(data.extras);
}

/** The run against 1,000 random versions of itself, and its Sharpe ratio's range (luck.py), on a snapshot's prices. */
export async function luckOnPython(config: BacktestConfig, snapshot: PriceSnapshot): Promise<LuckResult> {
  const data = await post("v1/backtests/luck", { config, prices: snapshot.series, market: snapshot.market?.data ?? null }, "Luck", 30_000);
  const result = parseLuck(data.result);
  if (!result) throw new PythonEngineError("The analytics service sent back a luck check MarketLab couldn't read.");
  return result;
}

/** How long to wait before the one retry, when the service couldn't be reached: long enough for it to wake from idle. */
const WAKE_DELAY_MS = 1500;

/**
 * POSTs JSON to the service with its token; returns the parsed body, or
 * throws a PythonEngineError with a message fit to show. A service that
 * sleeps when idle can refuse the first connection, or its host can answer
 * 502/504 while it starts, so those are tried once more after a moment.
 */
export async function post(path: string, body: unknown, what: string, timeoutMs?: number): Promise<Record<string, unknown>> {
  const token = process.env.ANALYTICS_SERVICE_TOKEN;
  if (!pythonConfigured() || !token) throw new PythonEngineError("The analytics service isn't set up on this server (ANALYTICS_URL and ANALYTICS_SERVICE_TOKEN).");
  const timeout = timeoutMs ?? (Number(process.env.ANALYTICS_TIMEOUT_MS) || 10_000);
  const send = () =>
    fetch(serviceUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    });
  let response: Response;
  try {
    response = await send().catch(async (error: unknown) => {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw error;
      await new Promise((resolve) => setTimeout(resolve, WAKE_DELAY_MS));
      return send();
    });
    if (response.status === 502 || response.status === 504) {
      await new Promise((resolve) => setTimeout(resolve, WAKE_DELAY_MS));
      response = await send();
    }
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    console.error(`[analytics] ${what} failed:`, error instanceof Error ? error.message : error);
    throw new PythonEngineError(timedOut ? `The analytics service didn't answer within ${timeout / 1000} seconds. Try again in a minute.` : SERVICE_DOWN);
  }
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail = typeof data?.error === "string" ? data.error : "";
    console.error(`[analytics] ${what} ${response.status}: ${detail}`);
    const problems = Array.isArray(data?.problems) ? (data.problems as unknown[]).filter((p) => typeof p === "string").join("; ") : "";
    if (response.status === 422 && problems) throw new PythonEngineError(`The analytics service refused these settings: ${problems}`);
    // The service's own messages for these are written for users (a full list, a run it can't reproduce, the database being down).
    if ([404, 409, 422, 429, 503].includes(response.status) && detail) throw new PythonEngineError(detail);
    if (response.status === 401) throw new PythonEngineError("The Python engine isn't accepting requests from this server (its service token is missing or doesn't match).");
    throw new PythonEngineError(`The Python engine failed (${response.status}). Try again in a minute.`);
  }
  if (!data) throw new PythonEngineError("The Python engine sent back an answer MarketLab couldn't read.");
  return data;
}

export interface PythonSave {
  ownerId: string;
  run: { id: string; name: string; createdAt: number };
  config: BacktestConfig;
  snapshot: PriceSnapshot;
  dataset: StoredResult["provenance"]["dataset"];
  note: string | null;
  assumptions: Record<string, string>;
}

/**
 * Saves a run through the Python service, which calculates it from the
 * snapshot itself and writes the result and snapshot to the database.
 * `ownerId` is whoever the Next.js server has verified (session or guest cookie).
 */
export async function savePythonRun(save: PythonSave): Promise<{ summary: RunSummary; result: StoredResult }> {
  const data = await post("v1/saved-runs", save, "save");
  const result = parseStoredResult(data.result);
  const summary = data.summary as RunSummary | undefined;
  if (!result || !summary || !["finalValue", "totalReturn", "cagr", "maxDrawdown", "benchmarkTotalReturn"].every((k) => isNumber(summary[k as keyof RunSummary]))) {
    throw new PythonEngineError("The Python engine sent back an answer MarketLab couldn't read.");
  }
  return { summary, result };
}

/** Has the Python service read one of the owner's saved runs from the database, recalculate it, and compare. */
export async function reproducePythonRun(runId: string, ownerId: string): Promise<{ reproduced: StoredResult; comparison: Comparison }> {
  const data = await post(`v1/saved-runs/${encodeURIComponent(runId)}/reproduce`, { ownerId }, "reproduce");
  const reproduced = parseStoredResult(data.reproduced);
  const c = data.comparison as Partial<Comparison> | undefined;
  if (!reproduced || typeof c?.matches !== "boolean" || !isNumber(c.largestDifference) || !Array.isArray(c.differences)) {
    throw new PythonEngineError("The Python engine sent back an answer MarketLab couldn't read.");
  }
  return { reproduced, comparison: { matches: c.matches, largestDifference: c.largestDifference, differences: c.differences.filter((d): d is string => typeof d === "string") } };
}

export interface PythonSweep {
  /** Each point's metrics, in the order sent (null where its settings couldn't run). */
  metrics: (Metrics | null)[];
  benchmark: Metrics;
  check: SelectionCheck | null;
}

const isMetrics = (m: unknown): m is Metrics => {
  const v = m as Record<string, unknown> | null;
  return !!v && ["finalValue", "totalReturn", "cagr", "maxDrawdown", "volatility", "exposure"].every((k) => isNumber(v[k])) && (v.sharpe === null || isNumber(v.sharpe));
};

/** Runs every point of a sweep on the snapshot's prices (the base config's window and stocks). */
export async function sweepOnPython(base: BacktestConfig, points: (BacktestConfig | null)[], snapshot: PriceSnapshot): Promise<PythonSweep> {
  const data = await post("v1/backtests/sweep", { base, points, prices: snapshot.series, market: snapshot.market?.data ?? null }, "Sweep", 30_000);
  const metrics = data.metrics as unknown[] | undefined;
  const c = data.check as SelectionCheck | null | undefined;
  const checkOk = c === null || (!!c && ["trials", "best", "expectedByLuck", "probability"].every((k) => isNumber(c[k as keyof SelectionCheck])));
  if (!Array.isArray(metrics) || metrics.length !== points.length || !metrics.every((m) => m === null || isMetrics(m)) || !isMetrics(data.benchmark) || !checkOk) {
    throw new PythonEngineError("The analytics service sent back a sweep MarketLab couldn't read.");
  }
  return { metrics: metrics as (Metrics | null)[], benchmark: data.benchmark, check: c ?? null };
}
