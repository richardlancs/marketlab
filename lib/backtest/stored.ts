/**
 * A backtest result with its provenance: what the server returns for a run,
 * and what a saved run stores so it can be shown again exactly as it was
 * calculated. Plain types and a reader, usable anywhere (the database layer,
 * the browser, tests).
 */
import type { BacktestOutcome } from "./config";
import type { BacktestRun } from "./engine";

export interface DatasetInfo {
  checksum: string;
  /** "<source>:<first 12 hex digits of the checksum>". */
  datasetVersion: string;
  /** "mock" (MarketLab's simulated market) or "tiingo" (real end-of-day prices). */
  source: string;
  simulated: boolean;
  /** The latest close in the market data when the prices were taken. */
  asOf: number;
  firstDate: number | null;
  lastDate: number | null;
  observations: number;
}

/** Where a result came from, and what it assumed: shown with it, and saved with it. */
export interface Provenance {
  engine: { name: string; version: string };
  dataset: DatasetInfo;
  assumptions: Record<string, string>;
  /** When the result was calculated. */
  computedAt: number;
}

/** A successful run: the results, a note to show with them, and their provenance. */
export interface StoredResult {
  outcome: BacktestOutcome;
  note: string | null;
  provenance: Provenance;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isRun(value: unknown): value is BacktestRun {
  const r = value as BacktestRun | null;
  return (
    !!r &&
    Array.isArray(r.equity) &&
    r.equity.every((p) => isNumber(p?.time) && isNumber(p?.price)) &&
    Array.isArray(r.trades) &&
    !!r.metrics &&
    isNumber(r.metrics.finalValue) &&
    isNumber(r.metrics.totalReturn)
  );
}

/** A stored result read back from the database, checked before it's shown; null if it isn't one. */
export function parseStoredResult(value: unknown): StoredResult | null {
  const v = value as Partial<StoredResult> | null;
  if (!v || !v.outcome || !isRun(v.outcome.run) || !isRun(v.outcome.benchmark)) return null;
  const p = v.provenance;
  if (!p || typeof p.engine?.name !== "string" || typeof p.engine.version !== "string" || typeof p.dataset?.checksum !== "string" || !isNumber(p.computedAt)) return null;
  return { outcome: v.outcome, note: typeof v.note === "string" ? v.note : null, provenance: p };
}

export interface Comparison {
  matches: boolean;
  /** The largest relative difference found in any equity value, trade or metric (0 when identical). */
  largestDifference: number;
  /** What differed, if anything, in plain words. */
  differences: string[];
}

/**
 * Compares a reproduced result with a stored one. Days, trade dates, sides
 * and symbols must be identical; numbers must agree within a relative 1e-9
 * (results from the same engine and inputs are normally identical; the
 * tolerance allows for a different machine's last-digit rounding).
 */
export function compareResults(stored: BacktestOutcome, reproduced: BacktestOutcome, tolerance = 1e-9): Comparison {
  const differences: string[] = [];
  let largest = 0;
  const number = (a: number | null, b: number | null, what: string) => {
    if (a === null || b === null) {
      if (a !== b) differences.push(`${what}: ${a} vs ${b}`);
      return;
    }
    const relative = Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
    largest = Math.max(largest, Math.abs(a - b) <= 1e-12 ? 0 : relative);
    if (Math.abs(a - b) > 1e-9 && relative > tolerance) differences.push(`${what}: stored ${b}, reproduced ${a}`);
  };
  for (const side of ["run", "benchmark"] as const) {
    const was = stored[side];
    const now = reproduced[side];
    if (was.equity.length !== now.equity.length || was.equity.some((p, i) => p.time !== now.equity[i].time)) {
      differences.push(`${side}: different days (${was.equity.length} stored, ${now.equity.length} reproduced)`);
      continue;
    }
    now.equity.forEach((p, i) => number(p.price, was.equity[i].price, `${side} value on day ${i + 1}`));
    if (was.trades.length !== now.trades.length) differences.push(`${side}: ${was.trades.length} trades stored, ${now.trades.length} reproduced`);
    else
      now.trades.forEach((t, i) => {
        const u = was.trades[i];
        if (t.time !== u.time || t.symbol !== u.symbol || t.side !== u.side) differences.push(`${side} trade ${i + 1} differs`);
        number(t.shares, u.shares, `${side} trade ${i + 1} shares`);
        number(t.price, u.price, `${side} trade ${i + 1} price`);
      });
    for (const key of ["finalValue", "totalReturn", "cagr", "maxDrawdown", "volatility", "sharpe", "exposure"] as const) number(now.metrics[key], was.metrics[key], `${side} ${key}`);
  }
  return { matches: differences.length === 0, largestDifference: largest, differences: differences.slice(0, 5) };
}
