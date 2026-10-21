import { describe, expect, it } from "vitest";
import fixture from "./fixtures/screen-result.json";
import { benchmarkLabel, MAX_PERIOD_DAYS, parseSavedScreen, parseScreenConfig, parseScreenResult, parseScreenSettings, percentileLabel, reasonFor, summarizeScreen, type CandidateRow } from "./history";

// A result calculated by the analytics service (services/analytics/analytics/screens.py): 8 stocks, Sep to Nov 2024.
const result = fixture as unknown;

const settings = { preset: "momentum", start: 1_700_000_000_000, end: 1_760_000_000_000, initialCash: 10_000, costs: { commission: 1, slippageBps: 5 } };
const isSymbol = (s: string) => /^[A-Z0-9][A-Z0-9.-]{0,9}$/.test(s);

describe("historical screen settings", () => {
  it("accepts the supported preset with sensible numbers", () => {
    expect(parseScreenSettings(settings)).toEqual(settings);
  });

  it("refuses anything else", () => {
    for (const bad of [
      null,
      "momentum",
      { ...settings, preset: "value" },
      { ...settings, start: settings.end },
      { ...settings, start: 1.5 },
      { ...settings, end: settings.start + (MAX_PERIOD_DAYS + 1) * 86_400_000 },
      { ...settings, initialCash: 50 },
      { ...settings, initialCash: Number.NaN },
      { ...settings, costs: { commission: -1, slippageBps: 5 } },
      { ...settings, costs: { commission: 1, slippageBps: 101 } },
      { ...settings, costs: undefined },
    ]) {
      expect(parseScreenSettings(bad)).toBeNull();
    }
  });

  it("drops anything extra the browser sends, such as its own candidate list", () => {
    expect(parseScreenSettings({ ...settings, universe: ["ZZZ"] })).not.toHaveProperty("universe");
  });

  it("reads a saved config with its exact candidates", () => {
    const config = { version: 1, ...settings, universe: ["AAPL", "MSFT"] };
    expect(parseScreenConfig(config, isSymbol)).toEqual(config);
    expect(parseScreenConfig({ ...config, universe: ["AAPL", "AAPL"] }, isSymbol)).toBeNull();
    expect(parseScreenConfig({ ...config, universe: [] }, isSymbol)).toBeNull();
    expect(parseScreenConfig({ ...config, universe: ["not a symbol"] }, isSymbol)).toBeNull();
    expect(parseScreenConfig({ ...config, version: 2 }, isSymbol)).toBeNull();
  });
});

describe("historical screen results", () => {
  it("reads what the analytics service sends", () => {
    const parsed = parseScreenResult(result);
    expect(parsed).not.toBeNull();
    expect(parsed!.months).toHaveLength(3);
    expect(parsed!.months[0].selected.map((s) => s.symbol)).toEqual(["S29", "S28"]);
    expect(parsed!.months[0].basedOn).toBeLessThan(parsed!.months[0].decision);
    expect(parsed!.provenance.method.name).toBe("monthly-momentum-leaders");
    expect(summarizeScreen(parsed!)).toEqual({
      finalValue: parsed!.run.metrics.finalValue,
      totalReturn: parsed!.run.metrics.totalReturn,
      cagr: parsed!.run.metrics.cagr,
      maxDrawdown: parsed!.run.metrics.maxDrawdown,
      benchmarkTotalReturn: parsed!.benchmark.metrics.totalReturn,
    });
  });

  it("refuses a result that isn't whole", () => {
    const r = structuredClone(fixture) as Record<string, unknown> & { months: unknown[]; benchmark: Record<string, unknown> };
    expect(parseScreenResult({ ...r, kind: "backtest" })).toBeNull();
    expect(parseScreenResult({ ...r, months: [] })).toBeNull();
    expect(parseScreenResult({ ...r, benchmark: { ...r.benchmark, dividends: "maybe" } })).toBeNull();
    expect(parseScreenResult({ ...r, provenance: undefined })).toBeNull();
    const month = structuredClone(r.months[0]) as Record<string, unknown>;
    expect(parseScreenResult({ ...r, months: [{ ...month, basedOn: month.decision }] })).toBeNull(); // a decision can't use its own day
  });

  it("names the benchmark and its dividends", () => {
    const parsed = parseScreenResult(result)!;
    expect(benchmarkLabel(parsed)).toMatchObject({ name: "S&P 500 index", dividends: expect.stringContaining("dividends aren't included") });
    expect(benchmarkLabel({ benchmark: { ...parsed.benchmark, dividends: "included" } })).toMatchObject({ name: "S&P 500 (SPY fund)", dividends: expect.stringContaining("Includes dividends") });
  });

  it("reads a saved screen for the list", () => {
    const run = { id: "r1", name: "Leaders", createdAt: 5, config: { version: 1, ...settings, universe: ["AAPL"] }, summary: summarizeScreen(parseScreenResult(result)!) };
    expect(parseSavedScreen(run, isSymbol)).toEqual(run);
    expect(parseSavedScreen({ ...run, name: "x".repeat(81) }, isSymbol)).toBeNull();
    expect(parseSavedScreen({ ...run, summary: {} }, isSymbol)).toBeNull();
  });
});

describe("reasons", () => {
  const month = { qualifying: 7 };
  const row = (status: CandidateRow[1], extra: Partial<{ m: number; p: number; close: number; average: number; closes: number }> = {}): CandidateRow => [
    "AAA",
    status,
    extra.m ?? 0.123,
    extra.p ?? 0.5,
    extra.close ?? 110,
    extra.average ?? 100,
    extra.closes ?? 253,
  ];

  it("explains every outcome from its numbers", () => {
    expect(reasonFor(row("qualified"), month)).toBe("Qualified (7 did), but only the top five are held.");
    expect(reasonFor(row("low-momentum", { p: 0.627 }), month)).toBe("Momentum +12.3% at the 62nd percentile; the top fifth (80th and up) was needed.");
    expect(reasonFor(row("low-momentum", { close: 90 }), month)).toContain("Also below its 200-day average.");
    expect(reasonFor(row("below-average", { p: 0.9, close: 95 }), month)).toBe("Momentum in the top fifth, but its close was 5.0% below its 200-day average.");
    expect(reasonFor(row("short-history", { closes: 180 }), month)).toBe("Only 180 of the 253 daily closes 12-1 momentum needs.");
    expect(reasonFor(row("no-price"), month)).toContain("No price on the latest session");
    expect(reasonFor(row("no-data"), month)).toBe("No prices yet on that date.");
  });

  it("labels percentiles as the service does", () => {
    expect(percentileLabel(0.9375)).toBe("93rd percentile");
    expect(percentileLabel(0.81)).toBe("81st percentile");
    expect(percentileLabel(0.112)).toBe("11th percentile");
    expect(percentileLabel(1)).toBe("highest");
  });
});
