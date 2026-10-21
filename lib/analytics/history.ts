/**
 * Historical screening, from the Next.js side: the settings, the result the
 * analytics service calculates (services/analytics/analytics/screens.py),
 * validation of both, and plain-words reasons for every candidate.
 *
 * The question: "If I had applied this screen every month, using only what
 * was known at the time, which stocks would I have owned, and how would the
 * portfolio have done?" Unlike the Screener's "Backtest the top 5" (today's
 * picks, bought and held), the picks are made again every month from the
 * prices up to that day.
 *
 * Pure: no server imports, so pages, the browser and tests can use it.
 */
import { LIMITS, MAX_RUN_NAME, type RunSummary, type StoredInfo } from "../backtest/config";
import type { BacktestRun } from "../backtest/engine";
import type { Provenance } from "../backtest/stored";

/** The one screen supported so far: the Screener's Momentum leaders preset, applied monthly. */
export const SCREEN_PRESETS = { momentum: "Monthly momentum leaders" } as const;
export type ScreenPreset = keyof typeof SCREEN_PRESETS;

/** The longest period, in days (the service also caps a run at 4,000 trading days including its warm-up). */
export const MAX_PERIOD_DAYS = Math.round(15 * 365.25);
/** Candidates per run: the catalog (about 100), with room to grow. Mirrors screens.MAX_UNIVERSE. */
export const MAX_UNIVERSE = 200;

/** What the user chooses. The candidates are always the catalog, added by the server. */
export interface ScreenSettings {
  preset: ScreenPreset;
  start: number;
  end: number;
  initialCash: number;
  costs: { commission: number; slippageBps: number };
}

/** What's run and saved: the settings and the exact candidate list. */
export interface ScreenConfig extends ScreenSettings {
  version: 1;
  universe: string[];
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const inRange = (v: unknown, min: number, max: number): v is number => isNumber(v) && v >= min && v <= max;

/** Settings from the browser, checked; null if they aren't valid. */
export function parseScreenSettings(value: unknown): ScreenSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const c = (v.costs ?? {}) as Record<string, unknown>;
  if (v.preset !== "momentum") return null;
  if (!Number.isInteger(v.start) || !Number.isInteger(v.end) || (v.start as number) >= (v.end as number)) return null;
  if ((v.end as number) - (v.start as number) > MAX_PERIOD_DAYS * 86_400_000) return null;
  if (!inRange(v.initialCash, LIMITS.minCash, LIMITS.maxCash) || !inRange(c.commission, 0, LIMITS.maxCommission) || !inRange(c.slippageBps, 0, LIMITS.maxSlippageBps)) return null;
  return { preset: "momentum", start: v.start as number, end: v.end as number, initialCash: v.initialCash, costs: { commission: c.commission, slippageBps: c.slippageBps } };
}

/** A saved config read back from the database. Symbols are checked for their format only, so a run on a stock since removed still opens. */
export function parseScreenConfig(value: unknown, isSymbol: (symbol: string) => boolean): ScreenConfig | null {
  const settings = parseScreenSettings(value);
  const v = value as Record<string, unknown> | null;
  if (!settings || v?.version !== 1 || !Array.isArray(v.universe) || v.universe.length < 1 || v.universe.length > MAX_UNIVERSE) return null;
  const universe = v.universe as unknown[];
  if (!universe.every((s): s is string => typeof s === "string" && isSymbol(s)) || new Set(universe).size !== universe.length) return null;
  return { version: 1, ...settings, universe: universe as string[] };
}

// ---------------------------------------------------------------------------
// The result (screens.py run_screen)
// ---------------------------------------------------------------------------

export type CandidateStatus = "selected" | "qualified" | "low-momentum" | "below-average" | "short-history" | "no-price" | "no-data";

/** One candidate on one decision date: [symbol, status, momentum, percentile, close, average, closes counted (up to 253)]. */
export type CandidateRow = [string, CandidateStatus, number | null, number | null, number | null, number | null, number];

export interface ScreenTrade {
  time: number;
  symbol: string;
  side: "buy" | "sell";
  shares: number;
  /** Fill price, after slippage. */
  price: number;
  /** The session's close it filled against. */
  close: number;
  value: number;
  commission: number;
  /** What slippage cost: shares × the gap between the fill and the close. */
  slippage: number;
}

export interface ScreenPick {
  symbol: string;
  rank: number;
  momentum: number;
  percentile: number;
  close: number;
  average: number;
  weight: number;
  explanation: string;
}

export interface ScreenMonth {
  /** The session the selection was made and traded on. */
  decision: number;
  /** The latest session whose prices it used (the one before). */
  basedOn: number;
  candidates: number;
  ranked: number;
  qualifying: number;
  selected: ScreenPick[];
  entered: string[];
  left: { symbol: string; explanation: string }[];
  kept: string[];
  notes: string[];
  table: CandidateRow[];
  trades: ScreenTrade[];
  commission: number;
  slippage: number;
  /** Cash and total value after the decision day's trades, at its close. */
  cash: number;
  value: number;
}

interface Costs {
  commission: number;
  slippage: number;
  total: number;
}

export interface ScreenResult {
  kind: "historical-screen";
  preset: { id: string; name: string; rules: string[] };
  settings: { start: number; end: number; initialCash: number; costs: { commission: number; slippageBps: number } };
  period: { requestedStart: number; requestedEnd: number; start: number; end: number; sessions: number; dataStart: number; warmupSessions: number };
  warnings: string[];
  run: BacktestRun;
  benchmark: BacktestRun & { symbol: string; name: string; dividends: "included" | "excluded"; costs: Costs };
  costs: Costs;
  /** Value sold per year ÷ average portfolio value: how much of the portfolio was replaced each year. */
  turnover: number | null;
  traded: number;
  months: ScreenMonth[];
  universe: { symbols: string[]; count: number; neverPriced: string[] };
  provenance: Provenance & { method: { name: string; version: string } };
}

const isRun = (r: unknown): r is BacktestRun => {
  const v = r as BacktestRun | null;
  return (
    !!v &&
    Array.isArray(v.equity) &&
    v.equity.length >= 2 &&
    v.equity.every((p) => Number.isInteger(p?.time) && isNumber(p?.price)) &&
    Array.isArray(v.trades) &&
    !!v.metrics &&
    ["finalValue", "totalReturn", "cagr", "maxDrawdown", "volatility", "exposure"].every((k) => isNumber(v.metrics[k as keyof typeof v.metrics])) &&
    (v.metrics.sharpe === null || isNumber(v.metrics.sharpe))
  );
};

const isMonth = (m: unknown): m is ScreenMonth => {
  const v = m as ScreenMonth | null;
  return (
    !!v &&
    Number.isInteger(v.decision) &&
    Number.isInteger(v.basedOn) &&
    v.basedOn < v.decision &&
    Array.isArray(v.selected) &&
    v.selected.length <= 5 &&
    v.selected.every((p) => typeof p.symbol === "string" && Number.isInteger(p.rank) && isNumber(p.momentum) && isNumber(p.weight) && typeof p.explanation === "string") &&
    Array.isArray(v.table) &&
    v.table.every((row) => Array.isArray(row) && row.length === 7 && typeof row[0] === "string" && typeof row[1] === "string") &&
    Array.isArray(v.trades) &&
    v.trades.every((t) => typeof t.symbol === "string" && (t.side === "buy" || t.side === "sell") && isNumber(t.price) && isNumber(t.commission) && isNumber(t.slippage)) &&
    Array.isArray(v.entered) &&
    Array.isArray(v.left) &&
    Array.isArray(v.notes) &&
    isNumber(v.cash) &&
    isNumber(v.value)
  );
};

/** A result from the service or the database, checked before it's shown; null if it isn't one. */
export function parseScreenResult(value: unknown): ScreenResult | null {
  const v = value as ScreenResult | null;
  if (!v || v.kind !== "historical-screen" || !isRun(v.run) || !isRun(v.benchmark)) return null;
  if ((v.benchmark.dividends !== "included" && v.benchmark.dividends !== "excluded") || !isNumber(v.benchmark.costs?.total)) return null;
  if (!v.period || !Number.isInteger(v.period.start) || !Number.isInteger(v.period.end) || !Array.isArray(v.months) || v.months.length < 1 || !v.months.every(isMonth)) return null;
  if (!v.costs || !isNumber(v.costs.total) || !(v.turnover === null || isNumber(v.turnover)) || !Array.isArray(v.warnings)) return null;
  const p = v.provenance;
  if (!p || typeof p.engine?.name !== "string" || typeof p.method?.version !== "string" || typeof p.dataset?.checksum !== "string" || typeof p.dataset.simulated !== "boolean" || !isNumber(p.computedAt)) return null;
  if (!v.universe || !Array.isArray(v.universe.symbols)) return null;
  return v;
}

export const summarizeScreen = (r: ScreenResult): RunSummary => ({
  finalValue: r.run.metrics.finalValue,
  totalReturn: r.run.metrics.totalReturn,
  cagr: r.run.metrics.cagr,
  maxDrawdown: r.run.metrics.maxDrawdown,
  benchmarkTotalReturn: r.benchmark.metrics.totalReturn,
});

// ---------------------------------------------------------------------------
// Saved screens
// ---------------------------------------------------------------------------

export interface SavedScreen {
  id: string;
  name: string;
  createdAt: number;
  config: ScreenConfig;
  summary: RunSummary;
  stored?: StoredInfo;
}

export function parseSavedScreen(value: unknown, isSymbol: (symbol: string) => boolean): SavedScreen | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const config = parseScreenConfig(v.config, isSymbol);
  const s = (v.summary ?? {}) as Record<string, unknown>;
  const keys = ["finalValue", "totalReturn", "cagr", "maxDrawdown", "benchmarkTotalReturn"] as const;
  if (!config || typeof v.id !== "string" || typeof v.name !== "string" || v.name.length > MAX_RUN_NAME || !isNumber(v.createdAt) || !keys.every((k) => isNumber(s[k]))) return null;
  return { id: v.id, name: v.name, createdAt: v.createdAt, config, summary: Object.fromEntries(keys.map((k) => [k, s[k]])) as unknown as RunSummary };
}

// ---------------------------------------------------------------------------
// Reasons, from the numbers
// ---------------------------------------------------------------------------

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};
/** "92nd percentile", or "highest" for the very top (as screens.py writes it). */
export const percentileLabel = (p: number) => (p < 1 ? `${ordinal(Math.floor(p * 100))} percentile` : "highest");

export const STATUS_LABELS: Record<CandidateStatus, string> = {
  selected: "Selected",
  qualified: "Qualified, not held",
  "low-momentum": "Momentum too low",
  "below-average": "Below 200-day average",
  "short-history": "Not enough history",
  "no-price": "No price that day",
  "no-data": "No prices yet",
};

/** A short reason for one candidate's row in a month's table. Selected stocks have the service's full explanation. */
export function reasonFor(row: CandidateRow, month: Pick<ScreenMonth, "qualifying">): string {
  const [, status, momentum, percentile, close, average, closes] = row;
  switch (status) {
    case "selected":
    case "qualified":
      return status === "selected" ? "In the top five qualifying stocks." : `Qualified (${month.qualifying} did), but only the top five are held.`;
    case "low-momentum":
      return `Momentum ${pct(momentum!)} at the ${percentileLabel(percentile!)}; the top fifth (80th and up) was needed.${close! > average! ? "" : " Also below its 200-day average."}`;
    case "below-average":
      return `Momentum in the top fifth, but its close was ${((1 - close! / average!) * 100).toFixed(1)}% below its 200-day average.`;
    case "short-history":
      return `Only ${closes} of the 253 daily closes 12-1 momentum needs.`;
    case "no-price":
      return "No price on the latest session, so it couldn't be ranked.";
    case "no-data":
      return "No prices yet on that date.";
  }
}

/** Where the results' prices came from, and the benchmark's dividend treatment, in words. */
export function benchmarkLabel(result: Pick<ScreenResult, "benchmark">): { name: string; dividends: string } {
  const b = result.benchmark;
  return b.dividends === "included"
    ? { name: `${b.name} (${b.symbol === "SPX" ? "SPY fund" : b.symbol})`, dividends: "Includes dividends: the fund's adjusted price." }
    : { name: `${b.name} index`, dividends: "Price index only: dividends aren't included, while the stocks' adjusted prices include theirs. That flatters the screen slightly." };
}
