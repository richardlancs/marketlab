/**
 * More measures of a finished backtest, from its equity curve and trades:
 * risk-adjusted returns, how it moved against its benchmark, and statistics
 * about its trades. Pure arithmetic on a result, so it works the same for
 * any engine and for saved or shared runs.
 *
 * - Sortino: mean daily return / downside deviation (losses only, target 0) × √252.
 * - Calmar: annual return (CAGR) / maximum drawdown.
 * - Beta, alpha, correlation: daily returns regressed on the benchmark's
 *   (alpha annualised: (mean − beta × benchmark mean) × 252).
 * - Tracking error: the standard deviation of the daily difference from the
 *   benchmark × √252; information ratio: that difference's mean × 252 / tracking error.
 * - Trades: a "round trip" is a stock bought from nothing and sold back to
 *   nothing. Its result is what the sells brought in (after costs) against
 *   what the buys cost (with costs). Win rate counts round trips that made money.
 * - Turnover: everything bought and sold, per year, as a multiple of the average value.
 * - Costs: commissions, plus slippage (the gap between each fill and that day's close).
 */
import type { BacktestConfig } from "./config";
import type { BacktestRun } from "./engine";

const DAYS_PER_YEAR = 252;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export interface RunAnalysis {
  sortino: number | null;
  calmar: number | null;
  beta: number | null;
  alpha: number | null;
  correlation: number | null;
  trackingError: number | null;
  informationRatio: number | null;
  roundTrips: number;
  winRate: number | null;
  averageGain: number | null;
  averageLoss: number | null;
  averageHoldingDays: number | null;
  turnover: number | null;
  commissions: number;
  slippage: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[], m = mean(xs)) => xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
const dailyReturns = (run: BacktestRun) => run.equity.slice(1).map((p, i) => p.price / run.equity[i].price - 1);

export function analyseRun(run: BacktestRun, benchmark: BacktestRun, config: Pick<BacktestConfig, "costs">): RunAnalysis {
  const r = dailyReturns(run);
  const enough = r.length >= 2;
  const downside = enough ? Math.sqrt(mean(r.map((x) => Math.min(x, 0) ** 2))) : 0;
  const sortino = enough && downside > 1e-12 ? (mean(r) / downside) * Math.sqrt(DAYS_PER_YEAR) : null;
  const calmar = run.metrics.maxDrawdown > 1e-9 ? run.metrics.cagr / run.metrics.maxDrawdown : null;

  // Against the benchmark, on the days both have (they're run over the same days).
  const benchmarkAt = new Map(benchmark.equity.map((p) => [p.time, p.price]));
  const pairs: [number, number][] = [];
  for (let i = 1; i < run.equity.length; i++) {
    const b0 = benchmarkAt.get(run.equity[i - 1].time);
    const b1 = benchmarkAt.get(run.equity[i].time);
    if (b0 !== undefined && b1 !== undefined) pairs.push([run.equity[i].price / run.equity[i - 1].price - 1, b1 / b0 - 1]);
  }
  let beta: number | null = null;
  let alpha: number | null = null;
  let correlation: number | null = null;
  let trackingError: number | null = null;
  let informationRatio: number | null = null;
  if (pairs.length >= 2) {
    const a = pairs.map((p) => p[0]);
    const b = pairs.map((p) => p[1]);
    const ma = mean(a);
    const mb = mean(b);
    const cov = pairs.reduce((s, [x, y]) => s + (x - ma) * (y - mb), 0) / (pairs.length - 1);
    const va = variance(a, ma);
    const vb = variance(b, mb);
    if (vb > 1e-18) {
      beta = cov / vb;
      alpha = (ma - beta * mb) * DAYS_PER_YEAR;
    }
    if (va > 1e-18 && vb > 1e-18) correlation = cov / Math.sqrt(va * vb);
    const active = pairs.map(([x, y]) => x - y);
    const te = Math.sqrt(variance(active)) * Math.sqrt(DAYS_PER_YEAR);
    if (te > 1e-9) {
      trackingError = te;
      informationRatio = (mean(active) * DAYS_PER_YEAR) / te;
    }
  }

  // Round trips, per stock: from the first buy while holding nothing to the sell that empties it.
  const slip = config.costs.slippageBps / 10_000;
  const open = new Map<string, { shares: number; spent: number; received: number; since: number }>();
  const results: { profit: number; days: number }[] = [];
  let traded = 0;
  let slippage = 0;
  let commissions = 0;
  for (const t of run.trades) {
    const value = t.shares * t.price;
    traded += value;
    commissions += t.commission;
    // The close was price / (1 ± slippage); the gap, times the shares, is what slippage cost.
    slippage += t.side === "buy" ? value - value / (1 + slip) : value / (1 - slip) - value;
    const position = open.get(t.symbol) ?? { shares: 0, spent: 0, received: 0, since: t.time };
    if (position.shares <= 1e-9) Object.assign(position, { shares: 0, spent: 0, received: 0, since: t.time });
    if (t.side === "buy") {
      position.shares += t.shares;
      position.spent += value + t.commission;
    } else {
      position.shares -= t.shares;
      position.received += value - t.commission;
      if (position.shares <= 1e-9) results.push({ profit: position.received - position.spent, days: (t.time - position.since) / 86_400_000 });
    }
    open.set(t.symbol, position);
  }
  const gains = results.filter((x) => x.profit > 0).map((x) => x.profit);
  const losses = results.filter((x) => x.profit <= 0).map((x) => x.profit);
  const years = run.equity.length > 1 ? (run.equity[run.equity.length - 1].time - run.equity[0].time) / YEAR_MS : 0;
  const averageValue = mean(run.equity.map((p) => p.price));

  return {
    sortino,
    calmar,
    beta,
    alpha,
    correlation,
    trackingError,
    informationRatio,
    roundTrips: results.length,
    winRate: results.length ? gains.length / results.length : null,
    averageGain: gains.length ? mean(gains) : null,
    averageLoss: losses.length ? mean(losses) : null,
    averageHoldingDays: results.length ? mean(results.map((x) => x.days)) : null,
    turnover: years > 0 && averageValue > 0 ? traded / averageValue / years : null,
    commissions,
    slippage,
  };
}
