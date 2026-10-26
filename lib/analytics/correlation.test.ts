import { describe, expect, it } from "vitest";
import { isCorrelationSummary } from "./portfolio";

const summary = {
  correlation: [
    [1, 0.8, 0.1],
    [0.8, 1, 0.2],
    [0.1, 0.2, 1],
  ],
  order: [2, 0, 1],
  effectiveBets: 1.9,
  closest: [{ a: "AAPL", b: "MSFT", correlation: 0.8 }],
};

describe("how stocks move together, from the analytics service", () => {
  it("is checked against the number of stocks", () => {
    expect(isCorrelationSummary(summary, 3)).toBe(true);
    expect(isCorrelationSummary(summary, 2)).toBe(false);
  });

  it("needs an order that lists every stock once", () => {
    expect(isCorrelationSummary({ ...summary, order: [0, 0, 1] }, 3)).toBe(false);
    expect(isCorrelationSummary({ ...summary, order: [0, 1] }, 3)).toBe(false);
  });

  it("refuses unreadable pairs and counts", () => {
    expect(isCorrelationSummary({ ...summary, effectiveBets: "two" }, 3)).toBe(false);
    expect(isCorrelationSummary({ ...summary, closest: [{ a: "AAPL", correlation: 0.8 }] }, 3)).toBe(false);
  });
});
