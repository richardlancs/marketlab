import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseExtras } from "./extras";

// The measures themselves are the analytics service's (services/analytics/tests/test_analysis.py); here, one of its cases.
const fixture = JSON.parse(readFileSync(join(__dirname, "../../services/analytics/tests/fixtures/analysis.json"), "utf8")) as { cases: { analysis: unknown; periods: unknown }[] };
const extras = { analysis: fixture.cases[0].analysis, periods: fixture.cases[0].periods };

describe("result extras from the analytics service", () => {
  it("are checked field by field", () => {
    expect(parseExtras(extras)).toEqual(extras);
    expect(parseExtras({ ...extras, analysis: { ...(extras.analysis as object), roundTrips: 1.5 } })).toBeNull();
    expect(parseExtras({ analysis: extras.analysis })).toBeNull();
    expect(parseExtras(null)).toBeNull();
  });

  it("may carry an optimised run's equal-weight comparison", () => {
    const metrics = { finalValue: 11_000, totalReturn: 0.1, cagr: 0.05, maxDrawdown: 0.08, drawdownPeak: null, drawdownTrough: null, volatility: 0.15, sharpe: 0.4, trades: 6, exposure: 1 };
    const alternative = { label: "Equal weights", equity: [{ time: 1, price: 10_000 }, { time: 2, price: 11_000 }], metrics };
    expect(parseExtras({ ...extras, alternative })).toEqual({ ...extras, alternative });
    expect(parseExtras({ ...extras, alternative: { ...alternative, equity: [{ time: 1.5, price: 1 }] } })).toBeNull();
    expect(parseExtras({ ...extras, alternative: { ...alternative, metrics: { ...metrics, sharpe: "high" } } })).toBeNull();
  });
});
