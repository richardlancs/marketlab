/**
 * "Was it luck?": a backtest compared with 1,000 random versions of itself,
 * and a range for its Sharpe ratio, as the analytics service calculates
 * them (services/analytics/analytics/luck.py). Types, a parser and the
 * plain-words verdict, so pages, the browser and tests can use them.
 *
 * - Timing strategies (moving-average crossover, custom rules) are compared
 *   with random timings that trade as often and stay invested as long.
 * - Picking strategies (momentum rotation, risk parity, optimised weights)
 *   are compared with the same decisions' weights handed out at random.
 * - The rest make no choice to test, and get only the Sharpe range.
 */

export interface LuckComparison {
  kind: "timing" | "picking";
  trials: number;
  /** The strategy, valued the same simple way as its random versions. */
  strategy: { totalReturn: number | null; sharpe: number | null };
  randomMedian: { totalReturn: number | null; sharpe: number | null };
  /** The share of random versions the strategy beat (0..1). */
  percentile: { totalReturn: number | null; sharpe: number | null };
  /** The random versions' total returns: `counts[i]` of them between `edges[i]` and `edges[i + 1]`. */
  histogram: { edges: (number | null)[]; counts: number[] };
}

export interface SharpeRange {
  sharpe: number | null;
  benchmarkSharpe: number | null;
  /** The middle 90% of the resampled Sharpe ratios. */
  low: number | null;
  high: number | null;
  /** How often the strategy's resampled Sharpe ratio beat the benchmark's, on the same days. */
  chanceAboveBenchmark: number | null;
  resamples: number;
  block: number;
}

export interface LuckResult {
  comparison: LuckComparison | null;
  sharpeRange: SharpeRange | null;
  notes: string[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const pair = (v: unknown) => {
  const p = obj(v);
  return !!p && numOrNull(p.totalReturn) && numOrNull(p.sharpe);
};

/** The result if `value` has its shape, or null. */
export function parseLuck(value: unknown): LuckResult | null {
  const v = obj(value);
  if (!v || !Array.isArray(v.notes) || !v.notes.every((n) => typeof n === "string")) return null;
  if (v.comparison !== null) {
    const c = obj(v.comparison);
    const h = obj(c?.histogram);
    if (!c || (c.kind !== "timing" && c.kind !== "picking") || !Number.isInteger(c.trials) || !pair(c.strategy) || !pair(c.randomMedian) || !pair(c.percentile)) return null;
    if (!h || !Array.isArray(h.edges) || !h.edges.every(numOrNull) || !Array.isArray(h.counts) || !h.counts.every((n) => Number.isInteger(n)) || h.edges.length !== h.counts.length + 1) return null;
  }
  if (v.sharpeRange !== null) {
    const r = obj(v.sharpeRange);
    if (!r || !["sharpe", "benchmarkSharpe", "low", "high", "chanceAboveBenchmark"].every((k) => numOrNull(r[k])) || !Number.isInteger(r.resamples) || !Number.isInteger(r.block)) return null;
  }
  return value as LuckResult;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** One plain sentence: how the strategy did against its random versions. */
export function luckVerdict(c: LuckComparison): string {
  const beat = c.percentile.totalReturn;
  if (beat === null) return "There wasn't enough to compare.";
  const versions = c.kind === "timing" ? "random timings that traded as often and stayed invested as long" : "random versions that spread the same weights over the stocks by chance";
  const head = `It beat ${percent(beat)} of ${c.trials.toLocaleString("en-US")} ${versions}.`;
  if (beat >= 0.95) return `${head} Luck alone rarely does that well (${percent(1 - beat)} of the time), so the choices may have mattered here. One period is still only one period.`;
  if (beat >= 0.75) return `${head} Better than most, but luck alone does this well ${percent(1 - beat)} of the time: suggestive, not convincing.`;
  if (beat >= 0.25) return `${head} That's what chance alone typically gives: no sign the choices added anything.`;
  return `${head} Random choices did better most of the time.`;
}
