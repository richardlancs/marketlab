/**
 * The backtest engine: the Python analytics service (services/analytics,
 * through ./python-client.ts). It runs every strategy and every sweep.
 * There's no fallback: if the service can't be reached, a run says so.
 *
 * MarketLab once had a TypeScript engine as well, kept identical to the
 * Python one; runs saved by it still open (their result is stored), and are
 * reproduced by the Python engine.
 */
import "server-only";
import type { BacktestConfig, BacktestOutcome } from "./config";
import { PythonEngineError, runOnPython } from "./python-client";
import type { PriceSnapshot } from "./snapshot";

/** "typescript" only appears on runs saved before the TypeScript engine was retired. */
export type EngineName = "typescript" | "python";
export interface EngineInfo {
  name: EngineName;
  version: string;
}

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

export interface Computed {
  outcome: BacktestOutcome;
  engine: EngineInfo;
  warnings: string[];
}

/** Runs a backtest on a snapshot's prices. Throws PythonEngineError if the service fails. */
export async function compute(config: BacktestConfig, snapshot: PriceSnapshot): Promise<Computed> {
  const result = await runOnPython(config, snapshot);
  if (result.engine.name !== "python") throw new PythonEngineError("The analytics service didn't identify itself as the Python engine.");
  return { outcome: result.outcome, engine: { name: "python", version: result.engine.version }, warnings: result.warnings };
}
