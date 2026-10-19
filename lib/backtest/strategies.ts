/**
 * The strategies a backtest can run. Each is a pure function of what it can
 * see (see StrategyContext in ./engine): same inputs, same decision.
 *
 * All of them take portfolio weights (symbol → fraction of the money), so a
 * single stock is just a portfolio with one 100% holding.
 */
import type { Strategy, StrategyContext } from "./engine";

export type Weights = Record<string, number>;

/** True when `day` is the first trading day of a new calendar month (not counting day 0). */
const startsMonth = (times: number[], day: number) =>
  day > 0 && new Date(times[day]).getUTCMonth() !== new Date(times[day - 1]).getUTCMonth();

/** How many new months have started from day 1 through `day`. */
function monthsStarted(times: number[], day: number): number {
  let count = 0;
  for (let d = 1; d <= day; d++) if (startsMonth(times, d)) count++;
  return count;
}

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
export function dollarCostAveraging(weights: Weights, installments: number): Strategy {
  return ({ day, times, cash }) => {
    if (day !== 0 && !startsMonth(times, day)) return null;
    const done = day === 0 ? 0 : monthsStarted(times, day);
    if (done >= installments) return null;
    // Spend an equal share of what's left, so the last installment uses it all.
    const amount = cash / (installments - done);
    return { type: "buy", amounts: Object.fromEntries(Object.entries(weights).map(([s, w]) => [s, amount * w])) };
  };
}

/**
 * Rebalancing: invest at the target weights, then reset to them at the start
 * of every month or quarter. Selling what grew and buying what shrank keeps
 * the risk at the level chosen.
 */
export function rebalancing(weights: Weights, frequency: "monthly" | "quarterly"): Strategy {
  const every = frequency === "monthly" ? 1 : 3;
  return ({ day, times }) => {
    if (day === 0) return { type: "target", weights };
    if (!startsMonth(times, day) || monthsStarted(times, day) % every !== 0) return null;
    return { type: "target", weights };
  };
}
