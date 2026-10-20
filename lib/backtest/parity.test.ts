/**
 * The reference results the Python engine is checked against
 * (services/analytics/tests/test_parity.py).
 *
 * services/analytics/tests/fixtures/parity.json holds fixed input prices
 * and this engine's exact results for each case. This test checks the
 * engine still produces exactly those results, so neither engine can drift
 * without a test failing. After a deliberate change to the engine,
 * regenerate the file with:
 *
 *   UPDATE_PARITY_FIXTURES=1 npx vitest run lib/backtest/parity.test.ts
 *
 * and re-run the Python tests to see whether Python still agrees.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../random";
import type { PricePoint } from "../types";
import { CONFIG_VERSION, runConfig, type BacktestConfig } from "./config";

const FILE = join(__dirname, "../../services/analytics/tests/fixtures/parity.json");
const DAY = 24 * 60 * 60 * 1000;

/** Weekdays at 20:00 UTC (like MarketLab's bars) from Oct 18, 2021. */
function weekdays(count: number): number[] {
  const times: number[] = [];
  for (let t = Date.UTC(2021, 9, 18, 20); times.length < count; t += DAY) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) times.push(t);
  }
  return times;
}

/** A seeded random walk, rounded to 4 decimals like stored prices. Arithmetic only, so it's the same everywhere. */
function walk(seed: number, times: number[], start: number, drift: number, swing: number): PricePoint[] {
  const rng = mulberry32(seed);
  let price = start;
  return times.map((time) => {
    price = price * (1 + drift + swing * (rng() + rng() + rng() - 1.5));
    return { time, price: Math.round(price * 10_000) / 10_000 };
  });
}

interface Case {
  name: string;
  description: string;
  config: BacktestConfig;
  prices: Record<string, PricePoint[]>;
  market: PricePoint[];
}

const base = (holdings: [string, number][], strategy: BacktestConfig["strategy"], times: number[], extra: Partial<BacktestConfig> = {}): BacktestConfig => ({
  version: CONFIG_VERSION,
  holdings: holdings.map(([symbol, weight]) => ({ symbol, weight })),
  strategy,
  start: times[0],
  end: times[times.length - 1],
  initialCash: 10_000,
  costs: { commission: 0, slippageBps: 0 },
  benchmark: "same-stocks",
  ...extra,
});

function makeCases(): Case[] {
  const times = weekdays(800);
  const aapl = walk(1, times, 150, 0.0006, 0.02);
  const ko = walk(2, times, 55, 0.0002, 0.01);
  const market = walk(3, times, 4500, 0.0004, 0.012);
  const short = weekdays(40);
  // Every 7th day missing from KO: the run uses only days both stocks have.
  const koGaps = ko.filter((_, i) => i % 7 !== 3);
  // A sawtooth: up 3 days, down 3 days, so a 2/3 crossover trades constantly.
  const saw = times.slice(0, 120).map((time, i) => ({ time, price: 100 + [0, 2, 4, 6, 4, 2][i % 6] + i * 0.01 }));
  return [
    {
      name: "aapl-ma-20-50-costs",
      description: "AAPL, 20/50-day crossover, $1 commission and 5 bps slippage, against buying and holding AAPL.",
      config: base([["AAPL", 1]], { kind: "moving-average", fast: 20, slow: 50 }, times, { costs: { commission: 1, slippageBps: 5 } }),
      prices: { AAPL: aapl },
      market,
    },
    {
      name: "aapl-ma-50-200-market",
      description: "AAPL, 50/200-day crossover, no costs, against the market index.",
      config: base([["AAPL", 1]], { kind: "moving-average", fast: 50, slow: 200 }, times, { benchmark: "market" }),
      prices: { AAPL: aapl },
      market,
    },
    {
      name: "two-stocks-buy-and-hold-market",
      description: "AAPL 60% and KO 40%, bought and held, $2 commission and 10 bps slippage, against the market index.",
      config: base([["AAPL", 0.6], ["KO", 0.4]], { kind: "buy-and-hold" }, times, { costs: { commission: 2, slippageBps: 10 }, benchmark: "market", initialCash: 25_000 }),
      prices: { AAPL: aapl, KO: ko },
      market,
    },
    {
      name: "missing-dates-two-stocks",
      description: "AAPL and KO (KO missing every 7th day), 10/30-day crossover per stock: only shared days are used.",
      config: base([["AAPL", 0.5], ["KO", 0.5]], { kind: "moving-average", fast: 10, slow: 30 }, times),
      prices: { AAPL: aapl, KO: koGaps },
      market,
    },
    {
      name: "date-window",
      description: "AAPL, 5/20-day crossover, over a window that cuts both ends of the data.",
      config: { ...base([["AAPL", 1]], { kind: "moving-average", fast: 5, slow: 20 }, times), start: times[200] - DAY / 2, end: times[700] + DAY / 2 },
      prices: { AAPL: aapl },
      market,
    },
    {
      name: "warm-up-longer-than-data",
      description: "40 days of prices with a 50/100-day crossover: never warms up, so it never trades.",
      config: base([["AAPL", 1]], { kind: "moving-average", fast: 50, slow: 100 }, short),
      prices: { AAPL: aapl.slice(0, 40) },
      market: market.slice(0, 40),
    },
    {
      name: "commission-larger-than-cash",
      description: "$100 of cash and a $100 commission: there's never anything left to buy with.",
      config: base([["AAPL", 1]], { kind: "buy-and-hold" }, times.slice(0, 50), { initialCash: 100, costs: { commission: 100, slippageBps: 0 } }),
      prices: { AAPL: aapl.slice(0, 50) },
      market: market.slice(0, 50),
    },
    {
      name: "sawtooth-whipsaw",
      description: "A sawtooth price and a 2/3-day crossover with costs: many trades, buying near tops and selling near bottoms.",
      config: base([["AAPL", 1]], { kind: "moving-average", fast: 2, slow: 3 }, times.slice(0, 120), { costs: { commission: 0.5, slippageBps: 3 } }),
      prices: { AAPL: saw },
      market: market.slice(0, 120),
    },
  ];
}

/** Prices as the Python service receives them: parallel lists. */
const toSeries = (points: PricePoint[]) => ({ times: points.map((p) => p.time), prices: points.map((p) => p.price) });

function fixtureFor(c: Case) {
  const { run, benchmark } = runConfig(c.config, c.prices, c.market);
  return {
    name: c.name,
    description: c.description,
    request: {
      config: c.config,
      prices: Object.fromEntries(Object.entries(c.prices).map(([s, p]) => [s, toSeries(p)])),
      market: toSeries(c.market),
    },
    expected: { run, benchmark },
  };
}

describe("parity fixtures for the Python engine", () => {
  const cases = makeCases();

  if (process.env.UPDATE_PARITY_FIXTURES) {
    it("are regenerated", () => {
      const file = {
        about:
          "Fixed inputs and the TypeScript engine's exact results (lib/backtest/engine.ts). Generated by lib/backtest/parity.test.ts; the Python engine must match them within the tolerances in services/analytics/tests/test_parity.py.",
        cases: cases.map(fixtureFor),
      };
      writeFileSync(FILE, `${JSON.stringify(file)}\n`);
    });
    return;
  }

  const stored = JSON.parse(readFileSync(FILE, "utf8")) as { cases: ReturnType<typeof fixtureFor>[] };
  it.each(cases.map((c) => [c.name, c] as const))("%s: this engine still gives the stored results", (name, c) => {
    const fixture = stored.cases.find((s) => s.name === name);
    expect(fixture, `run with UPDATE_PARITY_FIXTURES=1 to create ${name}`).toBeDefined();
    expect(fixtureFor(c)).toEqual(fixture);
  });
});
