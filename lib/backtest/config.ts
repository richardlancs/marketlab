/**
 * A backtest described as plain data: which stocks, which strategy, which
 * dates, how much money and what costs. Serializable, so a run can be saved
 * and re-run later, and validated, because saved runs come back from storage.
 */
import type { PricePoint } from "../types";
import { runBacktest, type BacktestRun, type Costs, type Series } from "./engine";
import { parseRuleSet, ruleStrategy, type RuleSet } from "./rules";
import { buyAndHold, dollarCostAveraging, momentumRotation, movingAverageCrossover, rebalancing, riskParity, type Weights } from "./strategies";

export type StrategyConfig =
  | { kind: "buy-and-hold" }
  | { kind: "moving-average"; fast: number; slow: number }
  | { kind: "dollar-cost-averaging"; installments: number }
  | { kind: "rebalancing"; frequency: "monthly" | "quarterly" }
  | { kind: "rules"; entry: RuleSet; exit: RuleSet }
  | { kind: "momentum-rotation"; top: number; lookbackMonths: 3 | 6 | 12; absolute: boolean }
  | { kind: "risk-parity"; frequency: "monthly" | "quarterly" };

/**
 * The version of the config format. Version 1 (Phase 4) had no `version`
 * field; version 2 added custom rules. Older configs are upgraded when read
 * (so far that only means stamping the version, since 2 only *added* things),
 * and configs from a newer version than this code knows are refused rather
 * than misread.
 *
 * This is separate from the version on the browser's saved-runs list
 * (saved-local.ts). Don't bump that one for config changes: a mismatch there
 * makes every guest's saved runs disappear.
 */
export const CONFIG_VERSION = 2;

export interface BacktestConfig {
  version: number;
  /** 1 to 5 stocks, with weights that add up to 1. */
  holdings: { symbol: string; weight: number }[];
  strategy: StrategyConfig;
  /** Timestamps; the run uses the trading days between them (inclusive). */
  start: number;
  end: number;
  initialCash: number;
  costs: Costs;
  /** What the strategy is compared with: buying and holding the same stocks, or the market (S&P 500). */
  benchmark: "same-stocks" | "market";
}

export const STRATEGY_NAMES: Record<StrategyConfig["kind"], string> = {
  "buy-and-hold": "Buy and hold",
  "moving-average": "Moving-average crossover",
  "dollar-cost-averaging": "Dollar-cost averaging",
  rebalancing: "Rebalancing",
  rules: "Custom rules",
  "momentum-rotation": "Momentum rotation",
  "risk-parity": "Risk parity",
};

export const LIMITS = {
  maxHoldings: 5,
  minCash: 100,
  maxCash: 10_000_000,
  maxCommission: 100,
  maxSlippageBps: 100,
  maxAverageDays: 250,
  maxInstallments: 60,
};

const weightsOf = (config: BacktestConfig): Weights => Object.fromEntries(config.holdings.map((h) => [h.symbol, h.weight]));

function strategyFor(config: BacktestConfig) {
  const weights = weightsOf(config);
  const s = config.strategy;
  switch (s.kind) {
    case "buy-and-hold":
      return buyAndHold(weights);
    case "moving-average":
      return movingAverageCrossover(weights, s.fast, s.slow);
    case "dollar-cost-averaging":
      return dollarCostAveraging(weights, s.installments);
    case "rebalancing":
      return rebalancing(weights, s.frequency);
    case "rules":
      return ruleStrategy(weights, s.entry, s.exit);
    case "momentum-rotation":
      return momentumRotation(weights, s.top, s.lookbackMonths, s.absolute);
    case "risk-parity":
      return riskParity(weights, s.frequency);
  }
}

export interface BacktestOutcome {
  run: BacktestRun;
  benchmark: BacktestRun;
}

/**
 * Runs the configured strategy and its benchmark over the same days.
 * `history` maps each symbol to its daily adjusted closes; `market` is the
 * S&P 500 (or the fund tracking it).
 */
export function runConfig(config: BacktestConfig, history: Record<string, PricePoint[]>, market: PricePoint[]): BacktestOutcome {
  const run = runStrategy(config, history);
  return { run, benchmark: runBenchmark(config, run, history, market) };
}

const seriesOf = (config: BacktestConfig, history: Record<string, PricePoint[]>): Series[] =>
  config.holdings.map((h) => ({ symbol: h.symbol, points: history[h.symbol] ?? [] }));
const optionsOf = (config: BacktestConfig) => ({ start: config.start, end: config.end, initialCash: config.initialCash, costs: config.costs });

/** Just the strategy, without its benchmark: what a parameter sweep runs for each point (the benchmark is the same for all). */
export function runStrategy(config: BacktestConfig, history: Record<string, PricePoint[]>): BacktestRun {
  return runBacktest(seriesOf(config, history), strategyFor(config), optionsOf(config));
}

/** The benchmark for a run: the same days, the same money. */
export function runBenchmark(config: BacktestConfig, run: BacktestRun, history: Record<string, PricePoint[]>, market: PricePoint[]): BacktestRun {
  const series = seriesOf(config, history);
  const options = optionsOf(config);
  // The benchmark runs on exactly the days the strategy did.
  const days = { ...options, start: run.equity[0].time, end: run.equity[run.equity.length - 1].time };
  return config.benchmark === "market"
    ? runBacktest([{ symbol: "MARKET", points: market }], buyAndHold({ MARKET: 1 }), days)
    : runBacktest(series, buyAndHold(weightsOf(config)), days);
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const inRange = (v: unknown, min: number, max: number): v is number => isNumber(v) && v >= min && v <= max;

/**
 * Returns a clean config if `value` is a valid one, with every symbol passing
 * `isKnown`, otherwise null. Saved runs are read with a format check only, so
 * a run on a stock that's missing from today's data isn't lost.
 */
export function parseConfig(value: unknown, isKnown: (symbol: string) => boolean): BacktestConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const version = v.version === undefined ? 1 : v.version;
  if (!Number.isInteger(version) || (version as number) < 1 || (version as number) > CONFIG_VERSION) return null;

  if (!Array.isArray(v.holdings) || v.holdings.length < 1 || v.holdings.length > LIMITS.maxHoldings) return null;
  const holdings: BacktestConfig["holdings"] = [];
  for (const h of v.holdings) {
    const { symbol, weight } = (h ?? {}) as Record<string, unknown>;
    if (typeof symbol !== "string" || !isKnown(symbol) || !inRange(weight, 0.0001, 1)) return null;
    if (holdings.some((x) => x.symbol === symbol)) return null;
    holdings.push({ symbol, weight });
  }
  if (Math.abs(holdings.reduce((sum, h) => sum + h.weight, 0) - 1) > 0.001) return null;

  const s = (v.strategy ?? {}) as Record<string, unknown>;
  let strategy: StrategyConfig;
  if (s.kind === "buy-and-hold") strategy = { kind: "buy-and-hold" };
  else if (s.kind === "moving-average" && Number.isInteger(s.fast) && Number.isInteger(s.slow) && inRange(s.fast, 2, LIMITS.maxAverageDays) && inRange(s.slow, 3, LIMITS.maxAverageDays) && (s.fast as number) < (s.slow as number))
    strategy = { kind: "moving-average", fast: s.fast as number, slow: s.slow as number };
  else if (s.kind === "dollar-cost-averaging" && Number.isInteger(s.installments) && inRange(s.installments, 1, LIMITS.maxInstallments))
    strategy = { kind: "dollar-cost-averaging", installments: s.installments as number };
  else if (s.kind === "rebalancing" && (s.frequency === "monthly" || s.frequency === "quarterly")) strategy = { kind: "rebalancing", frequency: s.frequency };
  else if (s.kind === "rules") {
    const entry = parseRuleSet(s.entry);
    const exit = parseRuleSet(s.exit);
    if (!entry || !exit) return null;
    strategy = { kind: "rules", entry, exit };
  } else if (s.kind === "momentum-rotation" && Number.isInteger(s.top) && inRange(s.top, 1, holdings.length) && (s.lookbackMonths === 3 || s.lookbackMonths === 6 || s.lookbackMonths === 12) && typeof s.absolute === "boolean")
    strategy = { kind: "momentum-rotation", top: s.top as number, lookbackMonths: s.lookbackMonths, absolute: s.absolute };
  else if (s.kind === "risk-parity" && (s.frequency === "monthly" || s.frequency === "quarterly")) strategy = { kind: "risk-parity", frequency: s.frequency };
  else return null;

  if (!isNumber(v.start) || !isNumber(v.end) || v.start >= v.end) return null;
  if (!inRange(v.initialCash, LIMITS.minCash, LIMITS.maxCash)) return null;
  const c = (v.costs ?? {}) as Record<string, unknown>;
  if (!inRange(c.commission, 0, LIMITS.maxCommission) || !inRange(c.slippageBps, 0, LIMITS.maxSlippageBps)) return null;
  if (v.benchmark !== "same-stocks" && v.benchmark !== "market") return null;

  return {
    version: CONFIG_VERSION, // read as any older version, now in the current format
    holdings,
    strategy,
    start: v.start,
    end: v.end,
    initialCash: v.initialCash,
    costs: { commission: c.commission, slippageBps: c.slippageBps },
    benchmark: v.benchmark,
  };
}

/** The headline numbers of a run, stored with a saved run so the list can show them without re-running. */
export interface RunSummary {
  finalValue: number;
  totalReturn: number;
  cagr: number;
  maxDrawdown: number;
  benchmarkTotalReturn: number;
}

export const summarize = ({ run, benchmark }: BacktestOutcome): RunSummary => ({
  finalValue: run.metrics.finalValue,
  totalReturn: run.metrics.totalReturn,
  cagr: run.metrics.cagr,
  maxDrawdown: run.metrics.maxDrawdown,
  benchmarkTotalReturn: benchmark.metrics.totalReturn,
});

/** What a saved run's stored result came from: shown in the list, without loading the result itself. */
export interface StoredInfo {
  engine: { name: string; version: string };
  dataSource: string;
  simulated: boolean;
  datasetVersion: string;
}

/** A backtest saved by the user: its settings, a name, and its results when saved. */
export interface SavedRun {
  id: string;
  name: string;
  createdAt: number;
  config: BacktestConfig;
  summary: RunSummary;
  /** Present when the full result and its input prices were saved (from migration 0006 on); absent for older runs, which kept only their settings. */
  stored?: StoredInfo;
}

export const MAX_SAVED_RUNS = 50;
export const MAX_RUN_NAME = 80;

/** A saved run read back from storage, validated like everything else from outside. */
export function parseSavedRun(value: unknown, isKnown: (symbol: string) => boolean): SavedRun | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const config = parseConfig(v.config, isKnown);
  const s = (v.summary ?? {}) as Record<string, unknown>;
  const summaryKeys = ["finalValue", "totalReturn", "cagr", "maxDrawdown", "benchmarkTotalReturn"] as const;
  if (!config || typeof v.id !== "string" || typeof v.name !== "string" || v.name.length > MAX_RUN_NAME || !isNumber(v.createdAt)) return null;
  if (!summaryKeys.every((k) => isNumber(s[k]))) return null;
  const summary = Object.fromEntries(summaryKeys.map((k) => [k, s[k]])) as unknown as RunSummary;
  return { id: v.id, name: v.name, createdAt: v.createdAt, config, summary };
}
