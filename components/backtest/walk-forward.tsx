"use client";

import { useState, useTransition } from "react";
import { ComparisonChart } from "@/components/charts/comparison-chart";
import { Explain } from "@/components/ui/explain";
import type { WalkForwardResult } from "@/lib/analytics/server";
import type { BacktestConfig } from "@/lib/backtest/config";
import { walkForwardAction } from "@/lib/backtest-actions";
import { formatDate, formatPercent, formatShare } from "@/lib/format";

type Range = { from: number; to: number; step: number };

/**
 * Walk-forward testing of the swept crossover settings: choose the best pair
 * on each past window, then see how it did on the next window it never saw.
 */
export function WalkForward({ base, fast, slow }: { base: BacktestConfig; fast: Range; slow: Range }) {
  const [trainYears, setTrainYears] = useState(2);
  const [testMonths, setTestMonths] = useState(6);
  const [result, setResult] = useState<{ ok: true; result: WalkForwardResult } | { ok: false; message: string } | null>(null);
  const [pending, start] = useTransition();
  const select = "h-9 rounded-lg border border-border bg-transparent px-2 text-sm";

  return (
    <section aria-labelledby="walk-forward" className="space-y-4 border-t border-border pt-6">
      <div>
        <h3 id="walk-forward" className="flex items-center gap-1.5 text-base font-semibold">
          Walk-forward test <Explain term="overfitting" />
        </h3>
        <p className="mt-1 text-sm text-muted">
          The honest version of this sweep: on each past window, pick the pair that did best, then run it on the next window it never saw. If picking the best pair worked, the out-of-sample line beats the
          others.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setResult(await walkForwardAction(base, fast, slow, trainYears, testMonths)));
        }}
      >
        <label className="text-xs text-muted">
          Choose on
          <select value={trainYears} onChange={(e) => setTrainYears(Number(e.target.value))} className={`${select} mt-1 block`}>
            {[1, 2, 3].map((y) => (
              <option key={y} value={y}>
                {y} year{y > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Then test on
          <select value={testMonths} onChange={(e) => setTestMonths(Number(e.target.value))} className={`${select} mt-1 block`}>
            {[3, 6, 12].map((m) => (
              <option key={m} value={m}>
                the next {m} months
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className="h-9 rounded-full bg-accent-fill px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60">
          {pending ? "Testing…" : "Run walk-forward test"}
        </button>
      </form>
      {result && !result.ok && (
        <p role="alert" className="text-sm text-loss">
          {result.message}
        </p>
      )}
      {result?.ok && <WalkForwardResults base={base} r={result.result} />}
    </section>
  );
}

function WalkForwardResults({ base, r }: { base: BacktestConfig; r: WalkForwardResult }) {
  const baseLabel = base.strategy.kind === "moving-average" ? `Fixed ${base.strategy.fast}/${base.strategy.slow}` : "Your settings";
  const lines = [
    { label: "Best-on-the-past, out of sample", curve: r.walkForward, color: "var(--series-1)" },
    { label: baseLabel, curve: r.base, color: "var(--series-3, var(--series-2))" },
    { label: "Buy and hold", curve: r.buyAndHold, color: "var(--series-2)", dashed: true },
  ];
  const won = r.walkForward.metrics.totalReturn > Math.max(r.base.metrics.totalReturn, r.buyAndHold.metrics.totalReturn);
  const held = r.efficiency === null ? null : r.efficiency >= 0.7 ? "most" : r.efficiency >= 0.3 ? "part" : "little";
  const verdict =
    held === null
      ? null
      : held === "most"
        ? `Most of the training Sharpe carried over to unseen data${won ? ", and choosing this way beat the alternatives" : ", though choosing this way didn't beat the alternatives here"}.`
        : held === "part"
          ? `Only part of the training Sharpe carried over: much of what looked like skill was fitting the past${won ? ", even though choosing this way came out ahead here" : ""}.`
          : won
            ? "Choosing this way came out ahead here, but the Sharpe ratio on unseen data was a fraction of what training promised: treat the edge as fragile, possibly luck."
            : "Little of the training Sharpe carried over, and choosing this way didn't beat the alternatives: the best settings were mostly fitted noise.";
  return (
    <div className="space-y-4">
      <ComparisonChart
        label="Out-of-sample growth: best settings chosen on the past, fixed settings, and buying and holding"
        times={r.walkForward.equity.map((p) => p[0])}
        series={lines.map((l) => ({ label: l.label, color: l.color, dashed: l.dashed, values: l.curve.equity.map((p) => p[1]) }))}
      />
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Sharpe while choosing</dt>
          <dd className="font-semibold tabular-nums">{r.meanInSampleSharpe?.toFixed(2) ?? "—"}</dd>
          <dd className="text-xs text-muted">the best pair, on average</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Sharpe on unseen data</dt>
          <dd className="font-semibold tabular-nums">{r.meanOutOfSampleSharpe?.toFixed(2) ?? "—"}</dd>
          <dd className="text-xs text-muted">the same pairs, next window</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Carried over</dt>
          <dd className="font-semibold tabular-nums">{r.efficiency === null ? "—" : formatShare(Math.max(r.efficiency, 0))}</dd>
          <dd className="text-xs text-muted">unseen ÷ while choosing</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Out-of-sample return</dt>
          <dd className="font-semibold tabular-nums">{formatPercent(r.walkForward.metrics.totalReturn)}</dd>
          <dd className="text-xs text-muted">
            vs {formatPercent(r.base.metrics.totalReturn)} fixed, {formatPercent(r.buyAndHold.metrics.totalReturn)} holding
          </dd>
        </div>
      </dl>
      {verdict && <p className="text-sm">{verdict}</p>}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-accent">Each window ({r.folds.length})</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full tabular-nums">
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1 text-left font-medium">Tested</th>
                <th scope="col" className="py-1 text-right font-medium">Chose</th>
                <th scope="col" className="py-1 text-right font-medium">Sharpe then</th>
                <th scope="col" className="py-1 text-right font-medium">Sharpe after</th>
                <th scope="col" className="py-1 text-right font-medium">Return</th>
                <th scope="col" className="py-1 text-right font-medium">Fixed</th>
                <th scope="col" className="py-1 text-right font-medium">Hold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.folds.map((f) => (
                <tr key={f.testStart}>
                  <td className="py-1.5">
                    {formatDate(f.testStart)} – {formatDate(f.testEnd)}
                  </td>
                  <td className="py-1.5 text-right">
                    {f.fast}/{f.slow}
                  </td>
                  <td className="py-1.5 text-right">{f.inSampleSharpe?.toFixed(2) ?? "—"}</td>
                  <td className="py-1.5 text-right">{f.outOfSampleSharpe?.toFixed(2) ?? "—"}</td>
                  <td className={`py-1.5 text-right ${f.outOfSampleReturn >= 0 ? "text-gain" : "text-loss"}`}>{formatPercent(f.outOfSampleReturn)}</td>
                  <td className="py-1.5 text-right">{formatPercent(f.baseReturn)}</td>
                  <td className="py-1.5 text-right">{formatPercent(f.holdReturn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          {r.combinations} pairs tried in each window, with the same costs as the backtest. Each window&apos;s averages warm up on the prices before it, never after.
        </p>
      </details>
    </div>
  );
}
