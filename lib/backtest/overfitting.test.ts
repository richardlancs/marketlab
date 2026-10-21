import { describe, expect, it } from "vitest";
import { inverseNormal, normalCdf, selectionCheck } from "./overfitting";

describe("normal distribution helpers", () => {
  it("match known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(inverseNormal(0.975)).toBeCloseTo(1.959964, 5);
    expect(inverseNormal(0.01)).toBeCloseTo(-2.326348, 5);
    for (const p of [0.001, 0.2, 0.5, 0.9, 0.999]) expect(normalCdf(inverseNormal(p))).toBeCloseTo(p, 6);
  });
});

describe("selectionCheck", () => {
  it("is less sure about the best of many tries than the best of few", () => {
    const few = selectionCheck([0.2, 0.5, 0.9], 750)!;
    const many = selectionCheck([...Array.from({ length: 97 }, (_, i) => -0.5 + i / 100), 0.2, 0.5, 0.9], 750)!;
    expect(few.trials).toBe(3);
    expect(many.trials).toBe(100);
    expect(many.expectedByLuck).toBeGreaterThan(few.expectedByLuck);
    expect(many.probability).toBeLessThan(few.probability);
    expect(few.best).toBeCloseTo(0.9, 9);
  });

  it("is more sure with a longer history, and ignores runs without a Sharpe ratio", () => {
    const short = selectionCheck([0.3, 0.6, 1.2, null], 250)!;
    const long = selectionCheck([0.3, 0.6, 1.2], 2500)!;
    expect(short.trials).toBe(3);
    expect(long.probability).toBeGreaterThan(short.probability);
    expect(selectionCheck([1, null], 500)).toBeNull();
  });
});
