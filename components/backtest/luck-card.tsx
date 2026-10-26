"use client";

import { useState } from "react";
import { Explain } from "@/components/ui/explain";
import { runLuckAction } from "@/lib/backtest-actions";
import type { BacktestConfig } from "@/lib/backtest/config";
import { luckVerdict, type LuckComparison, type LuckResult, type SharpeRange } from "@/lib/backtest/luck";
import { formatPercent, formatShare } from "@/lib/format";

type State = { status: "idle" } | { status: "running" } | { status: "error"; message: string } | { status: "done"; result: LuckResult };

/**
 * "Was it luck?" under a backtest's results: on request, the analytics
 * service runs 1,000 random versions of the strategy and resamples its daily
 * returns (lib/backtest/luck.ts). A saved run is checked on the prices it was
 * saved with.
 */
export function LuckCard({ config, savedRunId, strategyName, benchmarkName }: { config: BacktestConfig; savedRunId?: string; strategyName: string; benchmarkName: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function check() {
    setState({ status: "running" });
    try {
      const outcome = await runLuckAction(config, savedRunId);
      setState(outcome.ok ? { status: "done", result: outcome.result } : { status: "error", message: outcome.message });
    } catch {
      setState({ status: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  return (
    <section aria-labelledby="luck-heading" className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="luck-heading" className="flex items-center gap-1.5 text-sm font-semibold">
            Was it luck? <Explain term="luck" />
          </h3>
          <p className="text-xs text-muted">How this run compares with random versions of itself, and how sure its Sharpe ratio is.</p>
        </div>
        {state.status !== "done" && (
          <button
            type="button"
            onClick={check}
            disabled={state.status === "running"}
            className="h-9 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {state.status === "running" ? "Checking…" : "Was it luck?"}
          </button>
        )}
      </div>
      {state.status === "running" && <div aria-busy className="mt-4 h-40 animate-pulse rounded-lg bg-foreground/[0.06]" />}
      {state.status === "error" && (
        <p role="alert" className="mt-3 text-sm text-loss">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <div className="mt-4 space-y-6">
          {state.result.comparison && <RandomVersions c={state.result.comparison} strategyName={strategyName} />}
          {state.result.sharpeRange && <SharpeRangeView r={state.result.sharpeRange} benchmarkName={benchmarkName} />}
          {state.result.notes.map((note) => (
            <p key={note} className="text-sm text-muted">
              {note}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function RandomVersions({ c, strategyName }: { c: LuckComparison; strategyName: string }) {
  const [active, setActive] = useState<number | null>(null);
  const edges = c.histogram.edges.map((e) => e ?? 0);
  const ours = c.strategy.totalReturn ?? 0;
  const low = Math.min(edges[0], ours);
  const high = Math.max(edges[edges.length - 1], ours);
  const at = (v: number) => ((v - low) / (high - low || 1)) * 100;
  const most = Math.max(...c.histogram.counts, 1);
  const ourAt = at(ours);
  const median = c.randomMedian.totalReturn;

  return (
    <div>
      <p className="text-sm">{luckVerdict(c)}</p>
      <figure className="mt-3">
        <div role="img" aria-label={`Histogram of ${c.trials} random versions' total returns, with this run at ${formatPercent(ours)}`} className="relative pt-6" onPointerLeave={() => setActive(null)}>
          {/* Bars in HTML, so the text around them stays the same size at any width. */}
          <div className="relative h-28 border-b border-border">
            {c.histogram.counts.map((count, i) => (
              <div
                key={i}
                onPointerEnter={() => setActive(i)}
                className="absolute inset-y-0 flex items-end px-px"
                style={{ left: `${at(edges[i])}%`, width: `${at(edges[i + 1]) - at(edges[i])}%` }}
              >
                {count > 0 && <div className={`w-full rounded-t-[4px] ${active === i ? "bg-foreground/45" : "bg-foreground/25"}`} style={{ height: `${(count / most) * 100}%` }} />}
              </div>
            ))}
            <div className="pointer-events-none absolute -top-2 bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-accent" style={{ left: `${ourAt}%` }} />
          </div>
          <span
            className={`pointer-events-none absolute top-0 text-xs font-medium whitespace-nowrap ${ourAt > 75 ? "-translate-x-full" : ourAt > 25 ? "-translate-x-1/2" : ""}`}
            style={{ left: `${ourAt}%` }}
          >
            This run {formatPercent(ours)}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
          <span>{formatPercent(low)}</span>
          <span>Total return</span>
          <span>{formatPercent(high)}</span>
        </div>
        <figcaption className="mt-1 min-h-4 text-xs text-muted">
          {active !== null ? (
            <>
              <span className="font-medium text-foreground tabular-nums">{c.histogram.counts[active]}</span> random versions made {formatPercent(edges[active])} to {formatPercent(edges[active + 1])}
            </>
          ) : (
            <>Gray bars: {c.trials.toLocaleString("en-US")} random versions{median !== null && <>, half of them above {formatPercent(median)}</>}. Line: {strategyName.toLowerCase()}.</>
          )}
        </figcaption>
      </figure>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-accent">The numbers</summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm tabular-nums sm:max-w-md">
          <dt className="text-muted">Beat on total return</dt>
          <dd>{c.percentile.totalReturn === null ? "—" : formatShare(c.percentile.totalReturn)}</dd>
          <dt className="text-muted">Beat on Sharpe ratio</dt>
          <dd>{c.percentile.sharpe === null ? "—" : formatShare(c.percentile.sharpe)}</dd>
          <dt className="text-muted">Random versions&apos; median Sharpe</dt>
          <dd>{c.randomMedian.sharpe === null ? "—" : c.randomMedian.sharpe.toFixed(2)}</dd>
        </dl>
        <p className="mt-2 text-xs text-muted">
          {c.kind === "timing"
            ? "Each random version holds each stock for as many separate stretches and as many days as the strategy did, at random dates."
            : "Each random version rebalances on the strategy's days with its weights, but hands them to the stocks in a random order."}{" "}
          They and this run are valued the same simple way (each day&apos;s weighted return, less costs when positions change), so the line can sit slightly apart from the result above.
        </p>
      </details>
    </div>
  );
}

function SharpeRangeView({ r, benchmarkName }: { r: SharpeRange; benchmarkName: string }) {
  if (r.low === null || r.high === null) return null;
  const values = [r.low, r.high, r.sharpe, r.benchmarkSharpe].filter((v): v is number => v !== null);
  // A margin either side, so the band reads as a range within the axis rather than all of it.
  const margin = (Math.max(...values, 0) - Math.min(...values, 0)) * 0.15 || 0.5;
  const lo = Math.min(...values, 0) - margin;
  const hi = Math.max(...values, 0) + margin;
  const pct = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  const vs = benchmarkName.toLowerCase() === "buy and hold" ? "buying and holding" : benchmarkName;
  return (
    <div>
      <p className="text-sm">
        Its Sharpe ratio{r.sharpe !== null && ` of ${r.sharpe.toFixed(2)}`} could plausibly have been anywhere from <span className="font-medium tabular-nums">{r.low.toFixed(2)}</span> to{" "}
        <span className="font-medium tabular-nums">{r.high.toFixed(2)}</span> with the same kind of days in a different order
        {r.chanceAboveBenchmark !== null && (
          <>
            , and it came out ahead of {vs}&apos;s in <span className="font-medium tabular-nums">{formatShare(r.chanceAboveBenchmark)}</span> of those reshuffles
          </>
        )}
        .
      </p>
      <div className="relative mt-4 h-2 rounded-full bg-foreground/[0.06]" role="img" aria-label={`Sharpe ratio range ${r.low.toFixed(2)} to ${r.high.toFixed(2)}`}>
        <div className="absolute inset-y-0 rounded-full bg-accent/40" style={{ left: pct(r.low), width: `calc(${pct(r.high)} - ${pct(r.low)})` }} />
        {r.benchmarkSharpe !== null && <Tick at={pct(r.benchmarkSharpe)} />}
        {r.sharpe !== null && <Tick at={pct(r.sharpe)} strong />}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
        <span>{lo.toFixed(2)}</span>
        <span className="flex flex-wrap gap-x-3">
          {r.sharpe !== null && (
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-0.5 rounded-full bg-accent" /> This run {r.sharpe.toFixed(2)}
            </span>
          )}
          {r.benchmarkSharpe !== null && (
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-0.5 rounded-full bg-foreground/60" /> {benchmarkName} {r.benchmarkSharpe.toFixed(2)}
            </span>
          )}
        </span>
        <span>{hi.toFixed(2)}</span>
      </div>
      <p className="text-xs text-muted">
        Shaded: the middle 90% of {r.resamples.toLocaleString("en-US")} reshuffles of the run&apos;s own daily returns in {r.block}-day blocks (a block bootstrap), the run&apos;s and the benchmark&apos;s drawn from the same days.
      </p>
    </div>
  );
}

function Tick({ at, strong }: { at: string; strong?: boolean }) {
  return <div className={`absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${strong ? "bg-accent" : "bg-foreground/60"}`} style={{ left: at }} />;
}
