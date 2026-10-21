"use client";

import { useState } from "react";
import { HeatTable } from "@/components/charts/heat-table";
import { Card } from "@/components/ui/card";
import { Explain } from "@/components/ui/explain";
import type { BacktestConfig } from "@/lib/backtest/config";
import type { Metrics } from "@/lib/backtest/engine";
import { selectionCheck } from "@/lib/backtest/overfitting";
import { SWEEP_LIMITS, sweepableParams, type Axis, type SweepResult } from "@/lib/backtest/sweep";
import { formatPercent } from "@/lib/format";
import type { SweepState } from "./use-sweep";

export type Measure = "totalReturn" | "cagr" | "sharpe" | "maxDrawdown" | "vsBenchmark";

const MEASURES: Record<Measure, { label: string; value: (m: Metrics, benchmark: Metrics) => number | null; format: (v: number) => string; scale: "diverging" | "loss" }> = {
  totalReturn: { label: "Total return", value: (m) => m.totalReturn, format: formatPercent, scale: "diverging" },
  cagr: { label: "Annual return", value: (m) => m.cagr, format: formatPercent, scale: "diverging" },
  sharpe: { label: "Sharpe ratio", value: (m) => m.sharpe, format: (v) => v.toFixed(2), scale: "diverging" },
  maxDrawdown: { label: "Max drawdown", value: (m) => -m.maxDrawdown, format: formatPercent, scale: "loss" },
  vsBenchmark: { label: "Return vs benchmark", value: (m, b) => m.totalReturn - b.totalReturn, format: formatPercent, scale: "diverging" },
};

const input =
  "h-9 w-full rounded-lg border border-border bg-transparent px-2 text-base tabular-nums outline-none transition-colors focus-visible:border-accent sm:text-sm";

interface AxisDraft {
  param: string;
  from: string;
  to: string;
  step: string;
}

/** A sensible first range around the current value: about 7 values. */
function defaultAxis(config: BacktestConfig, param: string): AxisDraft {
  const p = sweepableParams(config).find((x) => x.id === param);
  if (!p) return { param, from: "", to: "", step: "" };
  const step = Math.max(1, Math.round(p.value / 4));
  const from = Math.max(p.min, p.value - 3 * step);
  const to = Math.min(p.max, from + 6 * step);
  return { param, from: String(from), to: String(to), step: String(step) };
}

/**
 * Sweep settings: pick one or two of the strategy's numbers to vary, and
 * their ranges. `base` is the form's current config (null if the form isn't
 * valid yet).
 */
export function SweepPanel({
  base,
  state,
  onRun,
  onCancel,
}: {
  base: BacktestConfig | null;
  state: SweepState;
  onRun: (axes: Axis[], measure: Measure) => void;
  onCancel: () => void;
}) {
  const params = base ? sweepableParams(base) : [];
  const [axes, setAxes] = useState<AxisDraft[]>([]);
  const [measure, setMeasure] = useState<Measure>("totalReturn");
  // Reset the ranges when the strategy's settings change shape (another strategy or other rules).
  const signature = params.map((p) => p.id).join(",");
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setAxes([]);
  }
  if (!base || params.length === 0) return null;

  const shown = axes.length ? axes : [defaultAxis(base, params[0].id)];
  const setAxis = (i: number, patch: Partial<AxisDraft>) => setAxes(shown.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const running = state.status === "running";

  return (
    <Card aria-labelledby="sweep">
      <h2 id="sweep" className="text-lg font-semibold tracking-tight">
        Test a range of settings
      </h2>
      <p className="mt-1 text-xs text-muted">
        Runs the backtest for every combination (up to {SWEEP_LIMITS.maxRuns}) and shows the results side by side.
      </p>
      <form
        className="mt-3 space-y-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onRun(shown.map((a): Axis => ({ param: a.param, from: Number(a.from), to: Number(a.to), step: Number(a.step) })), measure);
        }}
      >
        {shown.map((axis, i) => (
          <fieldset key={i} className="space-y-2">
            <legend className="sr-only">Setting {i + 1}</legend>
            <select
              aria-label={`Setting ${i + 1} to vary`}
              value={axis.param}
              onChange={(e) => setAxis(i, defaultAxis(base, e.target.value))}
              className={input}
            >
              {params.map((p) => (
                <option key={p.id} value={p.id} disabled={shown.some((a, j) => j !== i && a.param === p.id)}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              {(["from", "to", "step"] as const).map((field) => (
                <label key={field} className="text-xs text-muted">
                  {field === "from" ? "From" : field === "to" ? "To" : "Step"}
                  <input type="number" inputMode="numeric" value={axis[field]} onChange={(e) => setAxis(i, { [field]: e.target.value })} className={`${input} mt-1`} />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {shown.length === 1 && params.length > 1 && (
            <button
              type="button"
              onClick={() => setAxes([...shown, defaultAxis(base, params.find((p) => p.id !== shown[0].param)!.id)])}
              className="tap font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              + Vary a second setting
            </button>
          )}
          {shown.length === 2 && (
            <button type="button" onClick={() => setAxes(shown.slice(0, 1))} className="tap font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
              Vary just one
            </button>
          )}
        </div>
        <label className="block text-xs text-muted">
          Compare by
          <select value={measure} onChange={(e) => setMeasure(e.target.value as Measure)} className={`${input} mt-1`}>
            {(Object.keys(MEASURES) as Measure[]).map((m) => (
              <option key={m} value={m}>
                {MEASURES[m].label}
              </option>
            ))}
          </select>
        </label>
        {state.status === "error" && (
          <p role="alert" className="text-sm text-loss">
            {state.message}
          </p>
        )}
        {running ? (
          <div className="space-y-2">
            {/* aria-live: announced when the sweep starts. */}
            <p aria-live="polite" className="text-sm text-muted">
              Running {state.total} backtests on the server…
            </p>
            {/* No value: an indeterminate bar, since the server reports only when it's done. */}
            <progress className="h-1.5 w-full accent-accent" aria-label="Sweep progress" />
            <button
              type="button"
              onClick={onCancel}
              className="h-10 w-full rounded-full border border-border text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="submit"
            className="h-10 w-full rounded-full bg-accent-fill text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Run sweep
          </button>
        )}
      </form>
    </Card>
  );
}

/** A sweep's results: a heatmap for two settings, a one-column table for one. Select a cell to open those settings. */
export function SweepResults({ result, measure, onOpen }: { result: SweepResult; measure: Measure; onOpen: (config: BacktestConfig) => void }) {
  const m = MEASURES[measure];
  const [rowAxis, columnAxis] = result.axes;
  const valueOf = (i: number) => {
    const metrics = result.points[i].metrics;
    return metrics ? m.value(metrics, result.benchmark) : null;
  };
  const columns = columnAxis ? columnAxis.values.map(String) : [m.label];
  const width = columnAxis ? columnAxis.values.length : 1;
  const rows = rowAxis.values.map((v, r) => ({
    label: String(v),
    cells: Array.from({ length: width }, (_, c) => valueOf(r * width + c)),
  }));
  const invalid = result.points.filter((p) => !p.metrics).length;
  const span = result.points.find((p) => p.config)?.config;
  const sessions = span ? Math.round(((span.end - span.start) / (365.25 * 86_400_000)) * 252) : 0;
  const check = selectionCheck(
    result.points.map((p) => p.metrics?.sharpe ?? null),
    sessions,
  );

  return (
    <div className="space-y-3">
      <p className="text-sm">
        {m.label} for each combination of <span className="font-medium">{rowAxis.param.label.toLowerCase()}</span> (rows)
        {columnAxis && (
          <>
            {" "}
            and <span className="font-medium">{columnAxis.param.label.toLowerCase()}</span> (columns)
          </>
        )}
        . Select a value to open those settings.
      </p>
      <HeatTable
        caption={`Sweep results: ${m.label}`}
        corner={columnAxis ? `${rowAxis.param.label} ↓ / ${columnAxis.param.label} →` : rowAxis.param.label}
        columns={columns}
        rows={rows}
        format={m.format}
        colorScale={m.scale}
        onSelect={(r, c) => {
          const config = result.points[r * width + c].config;
          if (config) onOpen(config);
        }}
      />
      {invalid > 0 && <p className="text-xs text-muted">Empty cells: {invalid} combinations aren&apos;t valid (like a short average that isn&apos;t shorter than the long one) or couldn&apos;t run.</p>}
      <p className="rounded-lg bg-foreground/[0.04] p-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          The best cell is probably luck. <Explain term="overfitting" />
        </span> Settings that did best in the past usually just fit that period&apos;s ups and downs, and rarely stay best. A strategy is more convincing when a whole neighborhood of settings does well, not one cell.
        {check && (
          <>
            {" "}
            Here: the best of {check.trials} tries had a Sharpe ratio of {check.best.toFixed(2)}, where luck alone would be expected to reach about {Math.max(0, check.expectedByLuck).toFixed(2)}. Allowing for that, the chance its real Sharpe ratio is above zero is about{" "}
            <span className="font-medium text-foreground">{Math.round(check.probability * 100)}%</span> (deflated Sharpe ratio).
          </>
        )}
      </p>
    </div>
  );
}
