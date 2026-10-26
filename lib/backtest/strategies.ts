/**
 * The two strategies the Learn demos run in the browser (./engine.ts is the
 * small engine they run on). Every backtest on the site runs in the Python
 * analytics service, which has these and all the others. Each is a pure
 * function of what it can see (see StrategyContext in ./engine): same
 * inputs, same decision.
 *
 * Both take portfolio weights (symbol → fraction of the money), so a single
 * stock is just a portfolio with one 100% holding.
 */
import type { Strategy, StrategyContext } from "./engine";

export type Weights = Record<string, number>;

const average = (values: number[], count: number) => values.slice(-count).reduce((a, b) => a + b, 0) / count;

/** Invest everything on the first day, then never trade. */
export const buyAndHold =
  (weights: Weights): Strategy =>
  ({ day }) =>
    day === 0 ? { type: "target", weights } : null;

/**
 * Moving-average crossover, per stock: hold a stock (at its weight) while its
 * average close over the last `fast` days is above the average over the last
 * `slow` days, an uptrend; hold its share in cash otherwise. Starts trading
 * once there are `slow` days of history.
 */
export function movingAverageCrossover(weights: Weights, fast: number, slow: number): Strategy {
  return ({ closes, shares }: StrategyContext) => {
    const symbols = Object.keys(weights);
    if (symbols.some((s) => closes[s].length < slow)) return null;
    const target: Weights = {};
    let changed = false;
    for (const s of symbols) {
      const uptrend = average(closes[s], fast) > average(closes[s], slow);
      target[s] = uptrend ? weights[s] : 0;
      if (uptrend !== shares[s] > 0) changed = true;
    }
    // Only trade on a crossover, not every day (which would rebalance constantly).
    return changed ? { type: "target", weights: target } : null;
  };
}

/**
 * Dollar-cost averaging: instead of investing everything at once, spread the
 * starting cash over `installments` equal purchases, one on the first day and
 * then one at the start of each month.
 */
