/**
 * How much to trust the best result of a sweep. Trying many settings and
 * keeping the best one finds luck as well as skill: even with no real edge,
 * the best of 100 tries looks good. The Deflated Sharpe Ratio (Bailey and
 * López de Prado, 2014) asks how likely the best Sharpe ratio is to be above
 * zero once you allow for how many were tried and how much they varied.
 *
 * Simplifications: daily returns are treated as normal (no skew or fat
 * tails), and every try counts as independent. Neighbouring settings are
 * correlated, so this is a rough guide in the right direction, not a test.
 */

const SQRT2 = Math.SQRT2;
const EULER_GAMMA = 0.5772156649015329;

/** Error function (Abramowitz and Stegun 7.1.26, accurate to about 1e-7). */
function erf(x: number): number {
  const sign = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

export const normalCdf = (x: number) => 0.5 * (1 + erf(x / SQRT2));

/** The inverse of normalCdf (Acklam's rational approximation, accurate to about 1e-9). */
export function inverseNormal(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -inverseNormal(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface SelectionCheck {
  trials: number;
  best: number;
  /** The best Sharpe ratio pure luck would be expected to reach with this many tries (annualised). */
  expectedByLuck: number;
  /** How likely the best result's true Sharpe ratio is above zero, allowing for the tries (0–1). */
  probability: number;
}

/**
 * `sharpes` are the annualised Sharpe ratios of every try; `sessions` how
 * many trading days each run covered. Null with fewer than two usable tries.
 */
export function selectionCheck(sharpes: (number | null)[], sessions: number): SelectionCheck | null {
  const values = sharpes.filter((s): s is number => s !== null && Number.isFinite(s));
  const n = values.length;
  if (n < 2 || sessions < 3) return null;
  const perDay = values.map((s) => s / Math.sqrt(252));
  const mean = perDay.reduce((a, b) => a + b, 0) / n;
  const variance = perDay.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const best = Math.max(...perDay);
  // The expected maximum of n draws from a normal with that spread, centred on zero (no skill).
  const expected = Math.sqrt(variance) * ((1 - EULER_GAMMA) * inverseNormal(1 - 1 / n) + EULER_GAMMA * inverseNormal(1 - 1 / (n * Math.E)));
  const z = ((best - expected) * Math.sqrt(sessions - 1)) / Math.sqrt(1 + 0.5 * best * best);
  return { trials: n, best: best * Math.sqrt(252), expectedByLuck: expected * Math.sqrt(252), probability: normalCdf(z) };
}
