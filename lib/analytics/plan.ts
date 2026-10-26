/**
 * The goal planner's result, as the analytics service calculates it
 * (services/analytics/analytics/plan.py). Amounts are dollars, in today's
 * dollars when inflation is on. Types and a parser only.
 */

export const PLAN_LIMITS = { maxYears: 40, maxMonthly: 10_000_000 };

export interface GoalPlan {
  paths: number;
  years: number;
  historySessions: number;
  start: number;
  monthly: number;
  /** The yearly inflation used, or null when it's off. */
  inflation: number | null;
  months: number[];
  bands: Record<"p10" | "p25" | "p50" | "p75" | "p90", (number | null)[]>;
  final: { p10: number | null; median: number | null; p90: number | null };
  contributed: number;
  target: number | null;
  /** The share of paths ending at or above the target. */
  targetProbability: number | null;
  /** The share of paths whose money ran out (withdrawals). */
  runOutProbability: number;
  runOutMedianMonths: number | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);

export function parseGoalPlan(value: unknown): GoalPlan | null {
  const v = value as Record<string, unknown> | null;
  if (!v || ![v.paths, v.years, v.historySessions].every(Number.isInteger) || ![v.start, v.monthly, v.contributed, v.runOutProbability].every(isNum)) return null;
  if (![v.inflation, v.target, v.targetProbability, v.runOutMedianMonths].every(numOrNull) || !Array.isArray(v.months)) return null;
  const bands = v.bands as Record<string, unknown> | undefined;
  const n = (v.months as unknown[]).length;
  if (!bands || !["p10", "p25", "p50", "p75", "p90"].every((k) => Array.isArray(bands[k]) && (bands[k] as unknown[]).length === n && (bands[k] as unknown[]).every(numOrNull))) return null;
  const final = v.final as Record<string, unknown> | undefined;
  if (!final || ![final.p10, final.median, final.p90].every(numOrNull)) return null;
  return value as GoalPlan;
}
