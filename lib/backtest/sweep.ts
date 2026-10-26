/**
 * Parameter sweeps: run the same backtest over a grid of settings (say, every
 * short average from 10 to 50 days against every long one from 100 to 250)
 * and compare the results. This module defines what can be varied and builds
 * the grid of settings; the Python analytics service runs it
 * (./server.ts, sweepOnServer).
 *
 * A sweep shows how sensitive a strategy is to its settings. It doesn't find
 * the "best" ones: the setting that did best in the past is usually just the
 * one that fit the past's noise (overfitting), and rarely stays best.
 */
import { parseConfig, type BacktestConfig } from "./config";
import type { Metrics } from "./engine";
import { indicatorName, type Indicator, type RuleSet } from "./rules";

export const SWEEP_LIMITS = { maxValuesPerAxis: 15, maxRuns: 200 };

export interface SweepParam {
  /** Where the value lives, e.g. "fast" or "entry.0.right" (a rule's indicator). */
  id: string;
  label: string;
  min: number;
  max: number;
  /** The value in the base config. */
  value: number;
}

const ruleParams = (rules: RuleSet, side: "entry" | "exit"): SweepParam[] =>
  rules.conditions.flatMap((c, i) =>
    (["left", "right"] as const).flatMap((part) => {
      const indicator: Indicator = c[part];
      const name = `${side === "entry" ? "Buy" : "Sell"} rule ${i + 1}: ${indicatorName(indicator)}`;
      if (indicator.kind === "sma" || indicator.kind === "ema" || indicator.kind === "bollinger-upper" || indicator.kind === "bollinger-lower") return [{ id: `${side}.${i}.${part}`, label: `${name} (days)`, min: 2, max: 250, value: indicator.days }];
      if (indicator.kind === "rsi") return [{ id: `${side}.${i}.${part}`, label: `${name} (days)`, min: 2, max: 100, value: indicator.days }];
      if (indicator.kind === "value") return [{ id: `${side}.${i}.${part}`, label: `${side === "entry" ? "Buy" : "Sell"} rule ${i + 1}: level`, min: 0, max: 100, value: indicator.value }];
      return [];
    }),
  );

/** The numeric settings of a config that a sweep can vary. */
export function sweepableParams(config: BacktestConfig): SweepParam[] {
  const s = config.strategy;
  switch (s.kind) {
    case "moving-average":
      return [
        { id: "fast", label: "Short average (days)", min: 2, max: 249, value: s.fast },
        { id: "slow", label: "Long average (days)", min: 3, max: 250, value: s.slow },
      ];
    case "dollar-cost-averaging":
      return [{ id: "installments", label: "Monthly purchases", min: 1, max: 60, value: s.installments }];
    case "rules":
      return [...ruleParams(s.entry, "entry"), ...ruleParams(s.exit, "exit")];
    default:
      return [];
  }
}

/**
 * The config with one setting changed, or null if the result isn't a valid
 * config (e.g. a short average that's no longer shorter than the long one).
 * It goes through the same parser as everything else.
 */
export function withParam(config: BacktestConfig, id: string, value: number): BacktestConfig | null {
  return withParams(config, [[id, value]]);
}

/** Several settings changed at once, then checked once (so fast 60 + slow 80 works from fast 10 + slow 50). */
export function withParams(config: BacktestConfig, changes: [id: string, value: number][]): BacktestConfig | null {
  const next = structuredClone(config) as BacktestConfig;
  const s = next.strategy as Record<string, unknown>;
  for (const [id, value] of changes) {
    if (id === "fast" || id === "slow" || id === "installments") s[id] = value;
    else {
      const [side, index, part] = id.split(".");
      const indicator = (s[side] as RuleSet | undefined)?.conditions[Number(index)]?.[part as "left" | "right"] as Record<string, unknown> | undefined;
      if (!indicator) return null;
      if (indicator.kind === "value") indicator.value = value;
      else if ("days" in indicator) indicator.days = value;
      else return null;
    }
  }
  // Symbols were checked when the base config was made; only the strategy changed here.
  return parseConfig(next, () => true);
}

export interface Axis {
  param: string;
  from: number;
  to: number;
  step: number;
}

/** The values along an axis, from `from` to `to` in steps of `step` (rounded, since every setting is a whole number). */
export function axisValues({ from, to, step }: Axis): number[] | null {
  if (![from, to, step].every(Number.isFinite) || step <= 0 || to < from) return null;
  const values: number[] = [];
  for (let v = from; v <= to + 1e-9 && values.length <= SWEEP_LIMITS.maxValuesPerAxis; v += step) values.push(Math.round(v));
  const unique = [...new Set(values)];
  return unique.length > SWEEP_LIMITS.maxValuesPerAxis ? null : unique;
}

export interface SweepPoint {
  /** One value per axis. */
  values: number[];
  config: BacktestConfig | null;
  /** Null when these settings aren't valid, or couldn't run. */
  metrics: Metrics | null;
}

/**
 * How much to trust the best of the tries (the deflated Sharpe ratio,
 * calculated by the analytics service): trying many settings finds luck as
 * well as skill.
 */
export interface SelectionCheck {
  trials: number;
  best: number;
  /** The best Sharpe ratio pure luck would be expected to reach with this many tries (annualised). */
  expectedByLuck: number;
  /** How likely the best result's true Sharpe ratio is above zero, allowing for the tries (0–1). */
  probability: number;
}

export interface SweepResult {
  axes: { param: SweepParam; values: number[] }[];
  points: SweepPoint[];
  benchmark: Metrics;
  check: SelectionCheck | null;
}

/** The grid of configs to run, or an explanation of why the sweep is too big or malformed. */
export function buildGrid(base: BacktestConfig, axes: Axis[]): { axes: SweepResult["axes"]; points: SweepPoint[] } | { error: string } {
  const params = sweepableParams(base);
  if (axes.length < 1 || axes.length > 2) return { error: "Choose one or two settings to vary." };
  if (axes.length === 2 && axes[0].param === axes[1].param) return { error: "Choose two different settings." };
  const resolved: SweepResult["axes"] = [];
  for (const axis of axes) {
    const param = params.find((p) => p.id === axis.param);
    if (!param) return { error: "That setting can't be varied for this strategy." };
    const values = axisValues(axis);
    if (!values) return { error: `Each setting can take up to ${SWEEP_LIMITS.maxValuesPerAxis} values: check the range and step.` };
    if (values.some((v) => v < param.min || v > param.max)) return { error: `${param.label} must be between ${param.min} and ${param.max}.` };
    resolved.push({ param, values });
  }
  const combos = resolved.length === 1 ? resolved[0].values.map((v) => [v]) : resolved[0].values.flatMap((a) => resolved[1].values.map((b) => [a, b]));
  if (combos.length > SWEEP_LIMITS.maxRuns) return { error: `That's ${combos.length} runs; the most is ${SWEEP_LIMITS.maxRuns}. Use a bigger step or a smaller range.` };
  const points = combos.map((values) => ({
    values,
    config: withParams(
      base,
      values.map((v, i): [string, number] => [resolved[i].param.id, v]),
    ),
    metrics: null,
  }));
  return { axes: resolved, points };
}
