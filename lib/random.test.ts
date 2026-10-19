import { describe, expect, it } from "vitest";
import { bridge, gaussian, hashString, mulberry32 } from "./random";

describe("mulberry32", () => {
  it("produces the same sequence for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("produces different sequences for different seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("stays within [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 10_000; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe("hashString", () => {
  it("is stable and distinguishes inputs", () => {
    expect(hashString("AAPL")).toBe(hashString("AAPL"));
    expect(hashString("AAPL")).not.toBe(hashString("MSFT"));
  });
});

describe("gaussian", () => {
  it("has roughly mean 0 and standard deviation 1", () => {
    const rng = mulberry32(123);
    const samples = Array.from({ length: 20_000 }, () => gaussian(rng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(1, 1);
  });
});

describe("bridge", () => {
  it("starts and ends exactly on the targets", () => {
    const path = bridge(mulberry32(5), 100, 150, 50, 0.02);
    expect(path).toHaveLength(51);
    expect(path[0]).toBe(100);
    expect(path[50]).toBe(150);
  });

  it("never goes negative, even with high volatility", () => {
    const path = bridge(mulberry32(9), 10, 5, 500, 0.2);
    expect(path.every((p) => p > 0)).toBe(true);
  });
});
