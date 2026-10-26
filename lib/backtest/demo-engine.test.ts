/**
 * The Learn demos' small engine (./engine.ts, ./strategies.ts) against the
 * golden results the Python engine is held to
 * (services/analytics/tests/fixtures/golden.json), on the cases it can run:
 * buy and hold and the moving-average crossover. So a demo never teaches a
 * different answer from the site's backtester.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BacktestConfig } from "./config";
import { runBacktest, type BacktestRun } from "./engine";
import { buyAndHold, movingAverageCrossover } from "./strategies";

interface GoldenCase {
  name: string;
  request: { config: BacktestConfig; prices: Record<string, { times: number[]; prices: number[] }>; warmup?: string };
  expected: { run: BacktestRun; benchmark: BacktestRun };
}

const cases = (JSON.parse(readFileSync(join(__dirname, "../../services/analytics/tests/fixtures/golden.json"), "utf8")).cases as GoldenCase[]).filter(
  (c) => (c.request.config.strategy.kind === "buy-and-hold" || c.request.config.strategy.kind === "moving-average") && (c.request.warmup ?? "within-period") === "within-period",
);

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);

describe("the Learn demos' engine", () => {
  it("has cases to check", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  it.each(cases.map((c) => [c.name, c] as const))("matches the golden results: %s", (_, c) => {
    const { config, prices } = c.request;
    const weights = Object.fromEntries(config.holdings.map((h) => [h.symbol, h.weight]));
    const strategy = config.strategy.kind === "moving-average" ? movingAverageCrossover(weights, config.strategy.fast, config.strategy.slow) : buyAndHold(weights);
    const series = config.holdings.map((h) => ({ symbol: h.symbol, points: prices[h.symbol].times.map((time, i) => ({ time, price: prices[h.symbol].prices[i] })) }));
    const run = runBacktest(series, strategy, { start: config.start, end: config.end, initialCash: config.initialCash, costs: config.costs });
    const expected = c.expected.run;

    expect(run.equity.map((p) => p.time)).toEqual(expected.equity.map((p) => p.time));
    run.equity.forEach((p, i) => expect(close(p.price, expected.equity[i].price), `value on day ${i}`).toBe(true));
    expect(run.trades.map((t) => [t.time, t.symbol, t.side])).toEqual(expected.trades.map((t) => [t.time, t.symbol, t.side]));
    run.trades.forEach((t, i) => expect(close(t.shares, expected.trades[i].shares) && close(t.price, expected.trades[i].price)).toBe(true));
    for (const key of ["finalValue", "totalReturn", "cagr", "maxDrawdown", "volatility", "exposure"] as const) {
      expect(close(run.metrics[key], expected.metrics[key]), key).toBe(true);
    }
  });
});
