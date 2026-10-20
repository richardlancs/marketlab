/**
 * The backtest engines, behind one function: the TypeScript engine
 * (./engine.ts, in this server) or the Python analytics service
 * (services/analytics, through ./python-client.ts). Both follow the same
 * simulation rules and give the same results (checked by the parity tests).
 *
 * BACKTEST_ENGINE=typescript|python picks one, server-side only, TypeScript
 * by default. The Python service implements buy and hold and the
 * moving-average crossover; every other strategy, and every parameter sweep,
 * stays on TypeScript, and each result says which engine calculated it.
 */
import "server-only";
import { runConfig, type BacktestConfig, type BacktestOutcome } from "./config";
import { PythonEngineError, runOnPython } from "./python-client";
import { toPoints, type PriceSnapshot } from "./snapshot";

export type EngineName = "typescript" | "python";
export interface EngineInfo {
  name: EngineName;
  version: string;
}

/** The TypeScript engine's version: bump it when its results would change for the same inputs. */
export const TYPESCRIPT_ENGINE: EngineInfo = { name: "typescript", version: "1.1.0" };

/** The strategies the Python service runs. */
const PYTHON_STRATEGIES: ReadonlySet<BacktestConfig["strategy"]["kind"]> = new Set(["buy-and-hold", "moving-average"]);

/**
 * The simulation rules and data policy every result was calculated under,
 * saved with it so a stored result says exactly what it assumed.
 */
export const ASSUMPTIONS = {
  signals: "Decisions use closes up to the previous trading day only; orders fill at the day's close.",
  prices: "Split- and dividend-adjusted daily closes. Dividends are part of the adjusted price and are never added again.",
  shares: "Fractional shares. Buys never spend more than the cash left after the commission; sells never exceed the shares held, and selling out sells every share. Trades under $1 are skipped.",
  costs: "A fixed commission per order; slippage in basis points fills buys above the close and sells below it.",
  rebalancing: "A target sets each holding to a fraction of total value; sells are filled before buys.",
  warmUp: "A moving-average crossover first trades once it has as many closes as its long average.",
  benchmark: "Buying and holding the same stocks (or the market index) with the same money and costs, over exactly the strategy's days.",
  calendar: "Only days every series has are used; a missing day is skipped for all of them.",
} as const;

export function configuredEngine(): EngineName {
  const value = process.env.BACKTEST_ENGINE ?? "typescript";
  if (value === "typescript" || value === "python") return value;
  console.warn(`[backtest] BACKTEST_ENGINE="${value}" isn't "typescript" or "python"; using typescript.`);
  return "typescript";
}

/** The engine that runs this config: Python when it's selected and supports the strategy, otherwise TypeScript. */
export function engineFor(config: BacktestConfig, preferred: EngineName = configuredEngine()): EngineName {
  return preferred === "python" && PYTHON_STRATEGIES.has(config.strategy.kind) ? "python" : "typescript";
}

export interface Computed {
  outcome: BacktestOutcome;
  engine: EngineInfo;
  warnings: string[];
}

/** The same warning the Python engine gives, for results from either engine. */
function warningsFor(config: BacktestConfig, outcome: BacktestOutcome): string[] {
  const days = outcome.run.equity.length;
  if (config.strategy.kind === "moving-average" && days <= config.strategy.slow) {
    return [`The ${config.strategy.slow}-day average needs ${config.strategy.slow} days of prices before the first signal; this range has ${days}, so the strategy never traded.`];
  }
  return [];
}

/**
 * Runs a backtest on a snapshot's prices with the given engine. Throws
 * PythonEngineError if the Python engine fails: it never falls back.
 */
export async function compute(config: BacktestConfig, snapshot: PriceSnapshot, engine: EngineName): Promise<Computed> {
  if (engine === "python") {
    const result = await runOnPython(config, snapshot);
    if (result.engine.name !== "python") throw new PythonEngineError("The analytics service didn't identify itself as the Python engine.");
    return { outcome: result.outcome, engine: { name: "python", version: result.engine.version }, warnings: result.warnings };
  }
  const history = Object.fromEntries(Object.entries(snapshot.series).map(([symbol, data]) => [symbol, toPoints(data)]));
  const outcome = runConfig(config, history, snapshot.market ? toPoints(snapshot.market.data) : []);
  return { outcome, engine: TYPESCRIPT_ENGINE, warnings: warningsFor(config, outcome) };
}
