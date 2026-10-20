/**
 * Calls the Python analytics service (services/analytics) to calculate a
 * backtest. Server-only: it holds the service token, and only the Next.js
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
import type { BacktestConfig, BacktestOutcome } from "./config";
import type { BacktestRun, BacktestTrade, Metrics } from "./engine";
import type { PriceSnapshot } from "./snapshot";

export class PythonEngineError extends Error {}

/** The service's own limit, mirrored here so an oversized request fails before it's sent. */
const MAX_POINTS = 4000;

export interface PythonResult {
  outcome: BacktestOutcome;
  engine: { name: string; version: string };
  warnings: string[];
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
  if (!pythonConfigured()) throw new PythonEngineError("The Python engine is selected but not set up on this server (ANALYTICS_URL and ANALYTICS_SERVICE_TOKEN).");
  return healthVersion(process.env.ANALYTICS_URL as string);
}

async function healthVersion(base: string): Promise<string> {
  "use cache";
  cacheLife("minutes");
  void base; // part of the cache key, so another service URL is asked again
  let body: { engine?: { version?: unknown } } | null = null;
  try {
    const response = await fetch(serviceUrl("health"), { signal: AbortSignal.timeout(3000), cache: "no-store" });
    body = response.ok ? await response.json() : null;
  } catch (error) {
    console.error("[analytics] health check failed:", error instanceof Error ? error.message : error);
  }
  if (typeof body?.engine?.version !== "string") throw new PythonEngineError("The Python engine couldn't be reached. Try again in a minute.");
  return body.engine.version;
}

export async function runOnPython(config: BacktestConfig, snapshot: PriceSnapshot): Promise<PythonResult> {
  const token = process.env.ANALYTICS_SERVICE_TOKEN;
  if (!pythonConfigured() || !token) throw new PythonEngineError("The Python engine is selected but not set up on this server (ANALYTICS_URL and ANALYTICS_SERVICE_TOKEN).");
  const series = [...Object.values(snapshot.series), ...(snapshot.market ? [snapshot.market.data] : [])];
  if (series.some((s) => s.times.length > MAX_POINTS)) throw new PythonEngineError(`The Python engine takes at most ${MAX_POINTS} daily prices per stock. Choose a shorter period.`);

  const timeout = Number(process.env.ANALYTICS_TIMEOUT_MS) || 10_000;
  let response: Response;
  try {
    response = await fetch(serviceUrl("v1/backtests"), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ config, prices: snapshot.series, market: snapshot.market?.data ?? null }),
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    console.error("[analytics] request failed:", error instanceof Error ? error.message : error);
    throw new PythonEngineError(timedOut ? `The Python engine didn't answer within ${timeout / 1000} seconds. Try again, or a shorter period.` : "The Python engine couldn't be reached. Try again in a minute.");
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail = typeof body?.error === "string" ? body.error : "";
    const problems = Array.isArray(body?.problems) ? (body.problems as string[]).join("; ") : "";
    console.error(`[analytics] ${response.status}: ${detail} ${problems}`);
    if (response.status === 422) throw new PythonEngineError(`The Python engine refused these settings: ${problems || detail}`);
    if (response.status === 401 || response.status === 503) throw new PythonEngineError("The Python engine isn't accepting requests from this server (its service token is missing or doesn't match).");
    throw new PythonEngineError(`The Python engine failed (${response.status}). Try again in a minute.`);
  }

  const run = parseRun(body?.run);
  const benchmark = parseRun(body?.benchmark);
  const engine = body?.engine as { name?: unknown; version?: unknown } | undefined;
  if (!run || !benchmark || typeof engine?.name !== "string" || typeof engine.version !== "string") {
    throw new PythonEngineError("The Python engine sent back an answer MarketLab couldn't read.");
  }
  const warnings = Array.isArray(body?.warnings) ? (body.warnings as unknown[]).filter((w): w is string => typeof w === "string") : [];
  return { outcome: { run, benchmark }, engine: { name: engine.name, version: engine.version }, warnings };
}
