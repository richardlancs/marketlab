"use client";

import { useMemo, useState } from "react";
import { runBacktest } from "@/lib/backtest/engine";
import { buyAndHold, movingAverageCrossover } from "@/lib/backtest/strategies";
import {
  beta,
  blockVolatilities,
  compoundPath,
  demoTime,
  metricsOf,
  pathBetween,
  pricePath,
  recoveryNeeded,
  shockHalfLife,
  simplePath,
  stockWithBeta,
  toPricePoints,
  volatilityMoves,
  worstDrawdown,
} from "@/lib/lessons/demos";
import { Choice, DemoChart, DemoFrame, dollars, plainPercent, signedPercent, Slider, Stat, StatRow } from "./parts";

/** Compounding, total return and CAGR: money growing year by year, with and without growth on growth. */
export function GrowthDemo() {
  const [start, setStart] = useState(10_000);
  const [rate, setRate] = useState(0.07);
  const [years, setYears] = useState(20);
  const compound = compoundPath(start, rate, years);
  const simple = simplePath(start, rate, years);
  const end = compound[years];
  return (
    <DemoFrame title="Watch money compound" note="">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="Starting amount" value={start} min={1000} max={100_000} step={1000} format={dollars} onChange={setStart} />
        <Slider label="Yearly return" value={rate} min={0} max={0.15} step={0.005} format={(v) => plainPercent(v)} onChange={setRate} />
        <Slider label="Years" value={years} min={1} max={40} format={(v) => `${v} years`} onChange={setYears} />
      </div>
      <DemoChart
        series={[
          { label: "With compounding", values: compound, color: "var(--series-1)" },
          { label: "Without (gains not reinvested)", values: simple, color: "var(--series-2)", dashed: true },
        ]}
        format={(v) => dollars(v)}
        summary={`${dollars(start)} growing ${plainPercent(rate)} a year for ${years} years ends at ${dollars(end)} with compounding, against ${dollars(simple[years])} without.`}
      />
      <StatRow>
        <Stat label="Final value" value={dollars(end)} />
        <Stat label="Total return" value={signedPercent(end / start - 1)} tone="gain" />
        <Stat label="Annual return (CAGR)" value={plainPercent(rate)} hint="The same every year here" />
        <Stat label="Earned by compounding" value={dollars(end - simple[years])} hint="Growth on earlier growth" />
      </StatRow>
    </DemoFrame>
  );
}

/** Volatility: two paths that end at the same place, one calm and one wild. */
export function VolatilityDemo() {
  const [volatility, setVolatility] = useState(0.35);
  const days = 252;
  const calm = useMemo(() => pathBetween(21, 100, 110, days, 0.15), []);
  const wild = useMemo(() => pathBetween(22, 100, 110, days, volatility), [volatility]);
  const measured = metricsOf(wild).volatility;
  const worstDay = Math.min(...wild.slice(1).map((v, i) => v / wild[i] - 1));
  return (
    <DemoFrame title="Same result, different ride">
      <Slider label="Volatility of the second stock" value={volatility} min={0.05} max={0.6} step={0.01} format={(v) => plainPercent(v, 0)} onChange={setVolatility} />
      <DemoChart
        series={[
          { label: "Around 15% (a broad index)", values: calm, color: "var(--series-2)", dashed: true },
          { label: `Around ${plainPercent(volatility, 0)}`, values: wild, color: "var(--series-1)" },
        ]}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`Both end the year up 10%. The second swings with about ${plainPercent(measured, 0)} volatility; its worst day was ${signedPercent(worstDay)}.`}
      />
      <StatRow>
        <Stat label="Measured volatility" value={plainPercent(measured)} />
        <Stat label="A typical day's move" value={`±${plainPercent(measured / Math.sqrt(252))}`} hint="Volatility ÷ √252" />
        <Stat label="Worst day" value={signedPercent(worstDay)} tone="loss" />
      </StatRow>
    </DemoFrame>
  );
}

const DRAWDOWN_SCENARIOS = [
  { value: "calm", label: "Steady stock", seed: 31, annualVolatility: 0.15 },
  { value: "tech", label: "Tech stock", seed: 32, annualVolatility: 0.4 },
  { value: "rough", label: "Rough patch", seed: 37, annualVolatility: 0.3, annualReturn: -0.05 },
] as const;

/** Max drawdown: the worst peak-to-trough fall, shaded, and the gain needed to get back. */
export function DrawdownDemo() {
  const [scenario, setScenario] = useState<(typeof DRAWDOWN_SCENARIOS)[number]["value"]>("tech");
  const [fall, setFall] = useState(0.5);
  const spec = DRAWDOWN_SCENARIOS.find((s) => s.value === scenario)!;
  const values = useMemo(() => pricePath(spec.seed, 504, spec), [spec]);
  const worst = worstDrawdown(values);
  const recovered = values.findIndex((v, i) => i > worst.trough && v >= values[worst.peak]);
  return (
    <DemoFrame title="Find the worst fall">
      <Choice label="Example" options={DRAWDOWN_SCENARIOS} value={scenario} onChange={setScenario} />
      <DemoChart
        series={[{ label: "Price", values, color: "var(--series-1)" }]}
        shade={{ from: worst.peak, to: worst.trough, label: `−${plainPercent(worst.depth, 0)}` }}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`Over two years, the worst fall from a high was ${plainPercent(worst.depth)}, lasting ${worst.trough - worst.peak} trading days from peak to bottom.`}
      />
      <StatRow>
        <Stat label="Max drawdown" value={`−${plainPercent(worst.depth)}`} tone="loss" />
        <Stat label="Peak to bottom" value={`${worst.trough - worst.peak} days`} />
        <Stat label="Back to the peak" value={recovered < 0 ? "Not yet" : `${recovered - worst.trough} days later`} />
      </StatRow>
      <div className="border-t border-border pt-4">
        <Slider label="If you lose…" value={fall} min={0.05} max={0.9} step={0.05} format={(v) => `−${plainPercent(v, 0)}`} onChange={setFall} />
        <p className="mt-2 text-sm">
          …you need a gain of <span className="font-semibold text-gain">{signedPercent(recoveryNeeded(fall))}</span> to get back to where you started.
        </p>
      </div>
    </DemoFrame>
  );
}

/** Sharpe ratio: two strategies with the same return, one bumpier. */
export function SharpeDemo() {
  const [volatility, setVolatility] = useState(0.3);
  const smooth = useMemo(() => pathBetween(41, 100, 112, 252, 0.08), []);
  const bumpy = useMemo(() => pathBetween(42, 100, 112, 252, volatility), [volatility]);
  const a = metricsOf(smooth);
  const b = metricsOf(bumpy);
  return (
    <DemoFrame title="Same return, different Sharpe ratio">
      <Slider label="Bumpiness of strategy B" value={volatility} min={0.05} max={0.6} step={0.01} format={(v) => `${plainPercent(v, 0)} volatility`} onChange={setVolatility} />
      <DemoChart
        series={[
          { label: "Strategy A", values: smooth, color: "var(--series-1)" },
          { label: "Strategy B", values: bumpy, color: "var(--series-2)", dashed: true },
        ]}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`Both return 12% over the year. A's Sharpe ratio is ${a.sharpe?.toFixed(2)}, B's is ${b.sharpe?.toFixed(2)}.`}
      />
      <StatRow>
        <Stat label="Return (both)" value={signedPercent(a.totalReturn)} tone="gain" />
        <Stat label="Sharpe ratio, A" value={a.sharpe?.toFixed(2) ?? "—"} hint={`${plainPercent(a.volatility, 0)} volatility`} />
        <Stat label="Sharpe ratio, B" value={b.sharpe?.toFixed(2) ?? "—"} hint={`${plainPercent(b.volatility, 0)} volatility`} />
      </StatRow>
    </DemoFrame>
  );
}

/** Beta: a stock that moves more or less than the market. */
export function BetaDemo() {
  const [target, setTarget] = useState(1.5);
  const market = useMemo(() => pricePath(51, 252, { annualVolatility: 0.16, annualReturn: 0.1 }), []);
  const stock = useMemo(() => stockWithBeta(52, market, target, 0.12), [market, target]);
  const measured = beta(stock, market);
  const worstMarketDay = market.slice(1).reduce((worst, v, i) => (v / market[i] < market[worst + 1] / market[worst] ? i : worst), 0);
  const marketMove = market[worstMarketDay + 1] / market[worstMarketDay] - 1;
  const stockMove = stock[worstMarketDay + 1] / stock[worstMarketDay] - 1;
  return (
    <DemoFrame title="How much does it follow the market?">
      <Slider label="The stock's beta" value={target} min={0} max={2.5} step={0.1} format={(v) => v.toFixed(1)} onChange={setTarget} />
      <DemoChart
        series={[
          { label: "Market", values: market, color: "var(--series-2)", dashed: true },
          { label: "Stock", values: stock, color: "var(--series-1)" },
        ]}
        format={(v) => `$${v.toFixed(0)}`}
        summary={`A stock with a beta of about ${measured.toFixed(2)}: on the market's worst day (${signedPercent(marketMove)}) it moved ${signedPercent(stockMove)}.`}
      />
      <StatRow>
        <Stat label="Measured beta" value={measured.toFixed(2)} hint="From a year of daily moves" />
        <Stat label="Market's worst day" value={signedPercent(marketMove)} tone="loss" />
        <Stat label="The stock that day" value={signedPercent(stockMove)} tone={stockMove < 0 ? "loss" : "gain"} />
      </StatRow>
    </DemoFrame>
  );
}

const BENCHMARK_SCENARIOS = [
  { value: "rising", label: "Rising market", seed: 61, annualReturn: 0.15, annualVolatility: 0.2 },
  { value: "choppy", label: "Choppy market", seed: 62, annualReturn: 0.03, annualVolatility: 0.25 },
  { value: "falling", label: "Long fall", seed: 63, annualReturn: -0.15, annualVolatility: 0.25 },
] as const;

/** Benchmark and time invested: a trend-following strategy against simply holding. */
export function BenchmarkDemo() {
  const [scenario, setScenario] = useState<(typeof BENCHMARK_SCENARIOS)[number]["value"]>("rising");
  const spec = BENCHMARK_SCENARIOS.find((s) => s.value === scenario)!;
  const { prices, strategy, hold } = useMemo(() => {
    const prices = pricePath(spec.seed, 504, spec);
    const series = [{ symbol: "DEMO", points: toPricePoints(prices) }];
    const options = { start: demoTime(0), end: demoTime(prices.length - 1), initialCash: 10_000, costs: { commission: 0, slippageBps: 0 } };
    return {
      prices,
      strategy: runBacktest(series, movingAverageCrossover({ DEMO: 1 }, 20, 100), options),
      hold: runBacktest(series, buyAndHold({ DEMO: 1 }), options),
    };
  }, [spec]);
  const difference = strategy.metrics.totalReturn - hold.metrics.totalReturn;
  return (
    <DemoFrame title="Strategy against its benchmark">
      <Choice label="Market" options={BENCHMARK_SCENARIOS} value={scenario} onChange={setScenario} />
      <DemoChart
        series={[
          { label: "20/100-day crossover", values: strategy.equity.map((p) => p.price), color: "var(--series-1)" },
          { label: "Buy and hold (benchmark)", values: hold.equity.map((p) => p.price), color: "var(--series-2)", dashed: true },
        ]}
        format={(v) => dollars(v)}
        summary={`Over two years the strategy returned ${signedPercent(strategy.metrics.totalReturn)} and simply holding returned ${signedPercent(hold.metrics.totalReturn)}; the strategy was invested ${plainPercent(strategy.metrics.exposure, 0)} of the time.`}
      />
      <StatRow>
        <Stat label="Strategy" value={signedPercent(strategy.metrics.totalReturn)} tone={strategy.metrics.totalReturn >= 0 ? "gain" : "loss"} />
        <Stat label="Buy and hold" value={signedPercent(hold.metrics.totalReturn)} tone={hold.metrics.totalReturn >= 0 ? "gain" : "loss"} />
        <Stat label="Beat the benchmark by" value={signedPercent(difference)} tone={difference >= 0 ? "gain" : "loss"} />
        <Stat label="Time invested" value={plainPercent(strategy.metrics.exposure, 0)} hint={`${strategy.trades.length} trades`} />
      </StatRow>
      <p className="sr-only">The price started at ${prices[0].toFixed(0)}.</p>
    </DemoFrame>
  );
}

const VOLATILITY_KINDS = [
  { value: "constant", label: "Same size every day" },
  { value: "clustered", label: "Clustered (GARCH)" },
] as const;

/** Volatility clustering: the same random draws, with moves of a constant size or in calm and wild spells. */
export function VolatilityClusteringDemo() {
  const [kind, setKind] = useState<(typeof VOLATILITY_KINDS)[number]["value"]>("clustered");
  const [persistence, setPersistence] = useState(0.98);
  const clustered = kind === "clustered";
  const moves = useMemo(() => volatilityMoves(76, 504, { clustered, alpha: 0.09, beta: persistence - 0.09 }), [clustered, persistence]);
  const months = blockVolatilities(moves);
  const overall = blockVolatilities(moves, moves.length)[0];
  const calmest = Math.min(...months);
  const wildest = Math.max(...months);
  const biggest = moves.reduce((big, m) => (Math.abs(m) > Math.abs(big) ? m : big), 0);
  const halfLife = shockHalfLife(persistence);
  return (
    <DemoFrame title="Calm and wild spells">
      <Choice label="Daily moves" options={VOLATILITY_KINDS} value={kind} onChange={setKind} />
      {clustered && (
        <Slider label="How long spells last (alpha + beta)" value={persistence} min={0.8} max={0.99} step={0.01} format={(v) => `${v.toFixed(2)}: half-life ${shockHalfLife(v).toFixed(0)} days`} onChange={setPersistence} />
      )}
      <DemoChart
        series={[{ label: "Daily move", values: moves.map((m) => m * 100), color: "var(--series-1)" }]}
        format={(v) => `${v.toFixed(0)}%`}
        summary={`Two years of daily moves with ${plainPercent(overall, 0)} volatility overall. The calmest month ran at ${plainPercent(calmest, 0)} a year and the wildest at ${plainPercent(wildest, 0)}.`}
      />
      <StatRow>
        <Stat label="Volatility overall" value={plainPercent(overall, 0)} hint="Two years together" />
        <Stat label="Calmest month" value={plainPercent(calmest, 0)} hint="As a yearly rate" />
        <Stat label="Wildest month" value={plainPercent(wildest, 0)} hint="As a yearly rate" />
        <Stat label="Biggest day" value={signedPercent(biggest)} tone={biggest < 0 ? "loss" : "gain"} />
        <Stat label="A shock fades by half in" value={clustered ? `${halfLife.toFixed(0)} days` : "At once"} hint={clustered ? "log 0.5 ÷ log(alpha + beta)" : "Each day ignores the last"} />
      </StatRow>
    </DemoFrame>
  );
}
