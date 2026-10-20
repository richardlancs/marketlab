/**
 * Links from lessons into the app, including ready-made backtests: a share
 * link (/backtest#run=…) opens the backtest page with the settings filled in
 * and run, exactly as if someone had shared it.
 */
import { CONFIG_VERSION, type BacktestConfig, type StrategyConfig } from "../backtest/config";
import { shareFragment } from "../backtest/share";

/** Five years of daily prices, ending at the mock market's anchor day (Oct 16, 2026). */
const START = Date.UTC(2021, 9, 18);
const END = Date.UTC(2026, 9, 16);

/** A link that opens a backtest of `strategy` on `symbols` (equal weights), $10,000, no costs. */
export function backtestLink(
  strategy: StrategyConfig,
  symbols: string[],
  options: { benchmark?: BacktestConfig["benchmark"]; costs?: BacktestConfig["costs"] } = {},
): string {
  const config: BacktestConfig = {
    version: CONFIG_VERSION,
    holdings: symbols.map((symbol) => ({ symbol, weight: 1 / symbols.length })),
    strategy,
    start: START,
    end: END,
    initialCash: 10_000,
    costs: options.costs ?? { commission: 0, slippageBps: 0 },
    benchmark: options.benchmark ?? "same-stocks",
  };
  return `/backtest#${shareFragment(config)}`;
}
