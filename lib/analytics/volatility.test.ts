import { describe, expect, it } from "vitest";
import forecast from "./fixtures/volatility.json";
import { parseVolatility } from "./profile";

// The fixture is the analytics service's own output (volatility.forecast on a simulated GARCH series).
describe("parseVolatility", () => {
  it("accepts the analytics service's forecast", () => {
    const parsed = parseVolatility(forecast);
    expect(parsed?.model?.persistence).toBeGreaterThan(0.9);
    expect(parsed?.ranges?.month.high90).toBeGreaterThan(parsed?.ranges?.day.high90 ?? Infinity);
  });

  it("accepts a forecast without a model or a check", () => {
    expect(parseVolatility({ ...forecast, model: null, check: null })).not.toBeNull();
  });

  it("rejects broken shapes", () => {
    expect(parseVolatility(null)).toBeNull();
    expect(parseVolatility({ ...forecast, cone: "no" })).toBeNull();
    expect(parseVolatility({ ...forecast, ranges: { day: forecast.ranges.day } })).toBeNull();
    expect(parseVolatility({ ...forecast, model: { ...forecast.model, alpha: "x" } })).toBeNull();
  });
});
