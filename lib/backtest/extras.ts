/**
 * What a backtest's results page shows beyond the run itself, calculated by
 * the analytics service (services/analytics/analytics/analysis.py) with
 * every result: more measures (risk-adjusted returns, against the
 * benchmark, trade statistics) and returns by calendar month and year.
 * Types and a parser only.
 */
import type { Metrics } from "./engine";

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

export interface MonthReturn {
  year: number;
  /** 0 = January. */
  month: number;
  value: number;
  /** True for the run's first or last month when it only covers part of it. */
  partial: boolean;
}

export interface YearReturn {
  year: number;
  value: number;
  partial: boolean;
}

export interface PeriodReturns {
  months: MonthReturn[];
  years: YearReturn[];
}

/** For an optimised run: the same stocks at equal weights, rebalanced as often, to compare with. */
export interface AlternativeRun {
  label: string;
  equity: { time: number; price: number }[];
  metrics: Metrics;
}

export interface ResultExtras {
  analysis: RunAnalysis;
  periods: { run: PeriodReturns; benchmark: PeriodReturns };
  alternative?: AlternativeRun;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);
const NULLABLE = ["sortino", "calmar", "beta", "alpha", "correlation", "trackingError", "informationRatio", "winRate", "averageGain", "averageLoss", "averageHoldingDays", "turnover"] as const;

function isPeriods(v: unknown): v is PeriodReturns {
  const p = v as Record<string, unknown> | null;
  return (
    !!p &&
    Array.isArray(p.months) &&
    Array.isArray(p.years) &&
    (p.months as Record<string, unknown>[]).every((m) => Number.isInteger(m?.year) && Number.isInteger(m.month) && isNum(m.value) && typeof m.partial === "boolean") &&
    (p.years as Record<string, unknown>[]).every((y) => Number.isInteger(y?.year) && isNum(y.value) && typeof y.partial === "boolean")
  );
}

function isAlternative(v: unknown): v is AlternativeRun {
  const a = v as Record<string, unknown> | null;
  const m = a?.metrics as Record<string, unknown> | undefined;
  return (
    !!a &&
    typeof a.label === "string" &&
    Array.isArray(a.equity) &&
    (a.equity as Record<string, unknown>[]).every((p) => Number.isInteger(p?.time) && isNum(p.price)) &&
    !!m &&
    ["finalValue", "totalReturn", "cagr", "maxDrawdown", "volatility"].every((k) => isNum(m[k])) &&
    numOrNull(m.sharpe)
  );
}

/** The extras, checked field by field, or null. */
export function parseExtras(value: unknown): ResultExtras | null {
  const v = value as Record<string, unknown> | null;
  const a = v?.analysis as Record<string, unknown> | undefined;
  const p = v?.periods as Record<string, unknown> | undefined;
  if (!a || !p || !NULLABLE.every((k) => numOrNull(a[k])) || !Number.isInteger(a.roundTrips) || !isNum(a.commissions) || !isNum(a.slippage)) return null;
  if (!isPeriods(p.run) || !isPeriods(p.benchmark)) return null;
  if (v?.alternative !== undefined && !isAlternative(v.alternative)) return null;
  return value as ResultExtras;
}
