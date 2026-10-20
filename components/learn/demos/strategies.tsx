"use client";

import { useMemo, useState } from "react";
import { indicatorSeries } from "@/lib/backtest/rules";
import { crossoverReturns, lumpSumVersusMonthly, pricePath, rebalanceDrift, worstDrawdown } from "@/lib/lessons/demos";
import { Choice, DemoChart, DemoFrame, dollars, plainPercent, signedPercent, Slider, Stat, StatRow } from "./parts";

const AVERAGE_KINDS = [
  { value: "sma", label: "Simple (SMA)" },
  { value: "ema", label: "Exponential (EMA)" },
] as const;

/** Moving averages and crossovers: a price with a fast and a slow average, and where they cross. */
export function MovingAverageDemo() {
  const [kind, setKind] = useState<(typeof AVERAGE_KINDS)[number]["value"]>("sma");
  const [fast, setFast] = useState(20);
  const [slow, setSlow] = useState(100);
  const prices = useMemo(() => pricePath(91, 504, { annualReturn: 0.1, annualVolatility: 0.28 }), []);
  const fastLine = indicatorSeries({ kind, days: fast }, prices);
  const slowLine = indicatorSeries({ kind, days: Math.max(slow, fast + 1) }, prices);
  const crosses: { index: number; label: string }[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (![fastLine[i], slowLine[i], fastLine[i - 1], slowLine[i - 1]].every(Number.isFinite)) continue;
    const above = fastLine[i] > slowLine[i];
    if (above !== fastLine[i - 1] > slowLine[i - 1]) crosses.push({ index: i, label: above ? "Buy" : "Sell" });
  }
  const latestUp = fastLine.at(-1)! > slowLine.at(-1)!;
  return (
    <DemoFrame title="Averages and crossovers">
      <Choice label="Average type" options={AVERAGE_KINDS} value={kind} onChange={setKind} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Fast average" value={fast} min={5} max={100} format={(v) => `${v} days`} onChange={(v) => setFast(Math.min(v, slow - 5))} />
        <Slider label="Slow average" value={slow} min={20} max={250} format={(v) => `${v} days`} onChange={(v) => setSlow(Math.max(v, fast + 5))} />
      </div>
      <DemoChart
        series={[
          { label: "Price", values: prices, color: "var(--muted)" },
          { label: `${fast}-day ${kind.toUpperCase()}`, values: fastLine, color: "var(--series-1)" },
          { label: `${slow}-day ${kind.toUpperCase()}`, values: slowLine, color: "var(--series-2)", dashed: true },
        ]}
        markers={crosses.length <= 8 ? crosses : []}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`Over two years the ${fast}-day and ${slow}-day averages crossed ${crosses.length} times. The fast one is now ${latestUp ? "above" : "below"} the slow one.`}
      />
      <StatRow>
        <Stat label="Crossovers" value={String(crosses.length)} hint={crosses.length > 8 ? "Too many to label: whipsaws" : "Labeled on the chart"} />
        <Stat label="Signal now" value={latestUp ? "Uptrend: hold" : "Downtrend: cash"} tone={latestUp ? "gain" : "loss"} />
        <Stat label="Warm-up" value={`${slow} days`} hint="Before the slow average exists" />
      </StatRow>
    </DemoFrame>
  );
}

/** RSI: momentum on a 0–100 scale, with the conventional 30 and 70 lines. */
export function RsiDemo() {
  const [days, setDays] = useState(14);
  const prices = useMemo(() => pricePath(93, 252, { annualReturn: 0.05, annualVolatility: 0.32 }), []);
  const rsi = indicatorSeries({ kind: "rsi", days }, prices);
  const valid = rsi.filter(Number.isFinite);
  const above = valid.filter((v) => v > 70).length;
  const below = valid.filter((v) => v < 30).length;
  return (
    <DemoFrame title="Reading the RSI">
      <Slider label="RSI length" value={days} min={2} max={30} format={(v) => `${v} days`} onChange={setDays} />
      <DemoChart series={[{ label: "Price", values: prices, color: "var(--series-1)" }]} format={(v) => `$${v.toFixed(0)}`} height="h-40 sm:h-48" summary="The stock's price over a year." />
      <DemoChart
        series={[{ label: `${days}-day RSI`, values: rsi, color: "var(--series-2)" }]}
        domain={[0, 100]}
        bands={[
          { from: 70, to: 100, label: "Overbought (70+)" },
          { from: 0, to: 30, label: "Oversold (under 30)" },
        ]}
        height="h-36 sm:h-40"
        summary={`Its ${days}-day RSI was above 70 on ${above} days and below 30 on ${below} days.`}
      />
      <StatRow>
        <Stat label="Days above 70" value={String(above)} />
        <Stat label="Days below 30" value={String(below)} />
        <Stat label="RSI now" value={rsi.at(-1)!.toFixed(0)} />
      </StatRow>
      <p className="text-sm text-muted">Shorter lengths react faster and touch the extremes more often; longer ones rarely do.</p>
    </DemoFrame>
  );
}

const DCA_SCENARIOS = [
  { value: "rising", label: "Rising", seed: 101, annualReturn: 0.15, annualVolatility: 0.18 },
  { value: "dip", label: "Falls, then recovers", seed: 107, annualReturn: 0.02, annualVolatility: 0.35 },
  { value: "falling", label: "Falling", seed: 103, annualReturn: -0.2, annualVolatility: 0.25 },
] as const;

/** Dollar-cost averaging: all at once against monthly installments. */
export function DollarCostAveragingDemo() {
  const [scenario, setScenario] = useState<(typeof DCA_SCENARIOS)[number]["value"]>("rising");
  const [months, setMonths] = useState(12);
  const spec = DCA_SCENARIOS.find((s) => s.value === scenario)!;
  const prices = useMemo(() => pricePath(spec.seed, 378, spec), [spec]);
  const { lump, monthly, averageCost } = lumpSumVersusMonthly(prices, 12_000, months);
  const averagePrice = prices.filter((_, i) => i % 21 === 0).slice(0, months).reduce((a, b) => a + b, 0) / months;
  return (
    <DemoFrame title="All at once, or a bit each month?" note="$12,000 over a year and a half of generated prices.">
      <Choice label="Market" options={DCA_SCENARIOS} value={scenario} onChange={setScenario} />
      <Slider label="Spread over" value={months} min={2} max={18} format={(v) => `${v} months`} onChange={setMonths} />
      <DemoChart
        series={[
          { label: "All at once", values: lump, color: "var(--series-2)", dashed: true },
          { label: `Monthly over ${months} months`, values: monthly, color: "var(--series-1)" },
        ]}
        format={(v) => dollars(v)}
        summary={`Investing all at once ends at ${dollars(lump.at(-1)!)}; spreading it over ${months} months ends at ${dollars(monthly.at(-1)!)}.`}
      />
      <StatRow>
        <Stat label="All at once" value={dollars(lump.at(-1)!)} tone={lump.at(-1)! >= 12_000 ? "gain" : "loss"} />
        <Stat label="Monthly" value={dollars(monthly.at(-1)!)} tone={monthly.at(-1)! >= 12_000 ? "gain" : "loss"} />
        <Stat label="Average cost per share" value={dollars(averageCost)} hint={`Average price paid on: ${dollars(averagePrice)}`} />
      </StatRow>
    </DemoFrame>
  );
}

const REBALANCE_EVERY = [
  { value: "21", label: "Monthly" },
  { value: "63", label: "Quarterly" },
  { value: "252", label: "Yearly" },
] as const;

/** Rebalancing: a stock/bond mix drifting away from its target, and being reset to it. */
export function RebalancingDemo() {
  const [target, setTarget] = useState(0.6);
  const [every, setEvery] = useState<(typeof REBALANCE_EVERY)[number]["value"]>("63");
  const stocks = useMemo(() => pricePath(111, 1260, { annualReturn: 0.1, annualVolatility: 0.2 }), []);
  const bonds = useMemo(() => pricePath(112, 1260, { annualReturn: 0.035, annualVolatility: 0.05 }), []);
  const { drifting, rebalanced } = rebalanceDrift(stocks, bonds, target, Number(every));
  return (
    <DemoFrame title="Drift, and getting back on target" note="Five years of generated stock and bond prices.">
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <Slider label="Target in stocks" value={target} min={0.2} max={0.9} step={0.05} format={(v) => `${plainPercent(v, 0)} stocks / ${plainPercent(1 - v, 0)} bonds`} onChange={setTarget} />
        <Choice label="Rebalance" options={REBALANCE_EVERY} value={every} onChange={setEvery} />
      </div>
      <DemoChart
        series={[
          { label: "Left alone", values: drifting.share.map((s) => s * 100), color: "var(--series-2)", dashed: true },
          { label: "Rebalanced", values: rebalanced.share.map((s) => s * 100), color: "var(--series-1)" },
        ]}
        format={(v) => `${v.toFixed(0)}%`}
        summary={`Share of the portfolio in stocks: left alone it drifts from ${plainPercent(target, 0)} to ${plainPercent(drifting.share.at(-1)!, 0)}; rebalanced it stays near ${plainPercent(target, 0)}.`}
      />
      <StatRow>
        <Stat label="Stocks after 5 years, left alone" value={plainPercent(drifting.share.at(-1)!, 0)} hint={`Worst fall −${plainPercent(worstDrawdown(drifting.value).depth, 0)}`} />
        <Stat label="Stocks after 5 years, rebalanced" value={plainPercent(rebalanced.share.at(-1)!, 0)} hint={`Worst fall −${plainPercent(worstDrawdown(rebalanced.value).depth, 0)}`} />
        <Stat label="Return, alone / rebalanced" value={`${signedPercent(drifting.value.at(-1)! / 100 - 1)} / ${signedPercent(rebalanced.value.at(-1)! / 100 - 1)}`} />
      </StatRow>
    </DemoFrame>
  );
}

const FAST_SETTINGS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const SLOW = 100;

/** Overfitting: pick the best setting on one period, then see how it does on the next. */
export function OverfittingDemo() {
  const [seed, setSeed] = useState(103); // A clear case: the tuning winner comes last in the test. "Try another market" shows others.
  const { tuning, testing } = useMemo(() => {
    const prices = pricePath(seed, 1008, { annualReturn: 0.07, annualVolatility: 0.25 });
    return { tuning: crossoverReturns(prices.slice(0, 505), FAST_SETTINGS, SLOW), testing: crossoverReturns(prices.slice(504), FAST_SETTINGS, SLOW) };
  }, [seed]);
  const best = tuning.reduce((a, b) => (b.totalReturn > a.totalReturn ? b : a));
  const bestLater = testing.find((t) => t.fast === best.fast)!;
  const rank = [...testing].sort((a, b) => b.totalReturn - a.totalReturn).findIndex((t) => t.fast === best.fast) + 1;
  const max = Math.max(...[...tuning, ...testing].map((t) => Math.abs(t.totalReturn)), 0.01);
  return (
    <DemoFrame title="The best setting, then the next two years" note={`A ${SLOW}-day slow average with 12 fast settings, on generated prices. Try other markets to see how often the winner repeats.`}>
      <button
        type="button"
        onClick={() => setSeed((s) => s + 1)}
        className="rounded-full bg-foreground/5 px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-accent"
      >
        Try another market
      </button>
      <div className="grid gap-6 sm:grid-cols-2">
        {[
          { title: "Years 1–2: tuning", results: tuning },
          { title: "Years 3–4: the test", results: testing },
        ].map(({ title, results }) => (
          <div key={title}>
            <p className="text-sm font-medium">{title}</p>
            <ul className="mt-2 space-y-1">
              {results.map((r) => (
                <li key={r.fast} className="grid grid-cols-[3.5rem_1fr_4rem] items-center gap-2 text-xs">
                  <span className={r.fast === best.fast ? "font-semibold text-accent" : "text-muted"}>{r.fast} days</span>
                  <span className="relative h-3 rounded-sm bg-foreground/[0.04]">
                    <span
                      className={`absolute inset-y-0 left-1/2 rounded-sm ${r.totalReturn >= 0 ? "bg-gain/70" : "bg-loss/70"} ${r.fast === best.fast ? "ring-2 ring-accent" : ""}`}
                      style={r.totalReturn >= 0 ? { width: `${(r.totalReturn / max) * 50}%` } : { width: `${(-r.totalReturn / max) * 50}%`, transform: "translateX(-100%)" }}
                    />
                  </span>
                  <span className="text-right tabular-nums">{signedPercent(r.totalReturn)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <StatRow>
        <Stat label="Best while tuning" value={`${best.fast} days`} hint={signedPercent(best.totalReturn)} />
        <Stat label="Same setting, next 2 years" value={signedPercent(bestLater.totalReturn)} tone={bestLater.totalReturn >= 0 ? "gain" : "loss"} />
        <Stat label="Its rank in the test" value={`${rank} of ${FAST_SETTINGS.length}`} />
      </StatRow>
      <p className="sr-only">
        The best setting in years one and two, a {best.fast}-day fast average, returned {signedPercent(best.totalReturn)}; in years three and four it returned {signedPercent(bestLater.totalReturn)}, ranking {rank} of {FAST_SETTINGS.length}.
      </p>
    </DemoFrame>
  );
}
