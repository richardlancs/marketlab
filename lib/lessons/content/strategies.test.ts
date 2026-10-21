import { describe, expect, it } from "vitest";
import type { Lesson } from "../types";
import { STRATEGIES_LESSONS } from "./strategies";

/** Everything in a lesson's worked example, as one string. */
const exampleText = (lesson: Lesson | undefined) => {
  if (!lesson) throw new Error("missing lesson");
  return [lesson.example.setup, ...lesson.example.steps, lesson.example.result].join(" ");
};
const money = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

describe("strategy worked examples", () => {
  it("buy and hold: holding through a fall, and selling at the low", () => {
    const text = exampleText(STRATEGIES_LESSONS.buyAndHold);
    const shares = 10_000 / 50;
    expect(shares).toBe(200);
    expect(text).toContain(`${shares} shares`);
    expect(text).toContain(money(shares * 35));
    expect(text).toContain(`${Math.round((1 - 35 / 50) * 100)}% loss`);
    expect(text).toContain(money(shares * 70));
    expect(text).toContain(`${Math.round((70 / 50 - 1) * 100)}% gain`);
    const rebought = (shares * 35) / 50;
    expect(text).toContain(`${rebought} shares`);
    expect(text).toContain(money(rebought * 70));
    expect(text).toContain(`${Math.round((1 - (rebought * 70) / 10_000) * 100)}% loss`);
  });

  it("dollar-cost averaging: shares bought, average cost and the end value", () => {
    const text = exampleText(STRATEGIES_LESSONS.dollarCostAveraging);
    const prices = [50, 40, 25, 40, 50];
    const shares = prices.map((p) => 100 / p);
    expect(text).toContain(shares.join(" + "));
    const total = shares.reduce((a, b) => a + b, 0);
    expect(total).toBe(13);
    expect(text).toContain(`${total} shares`);
    expect(text).toContain(`≈ $${(500 / total).toFixed(2)}`);
    expect(text).toContain(`= $${prices.reduce((a, b) => a + b, 0) / prices.length}`);
    expect(text).toContain(money(total * 50));
    expect(text).toContain(`${Math.round((total * 50) / 500 * 100 - 100)}% gain`);
    expect(text).toContain(`${500 / 50} shares`);
  });

  it("rebalancing: drift, the trade and the next year's fall", () => {
    const text = exampleText(STRATEGIES_LESSONS.rebalancing);
    const stocks = 6_000 * 1.3;
    const bonds = 4_000 * 1.05;
    const total = stocks + bonds;
    expect(text).toContain(money(stocks));
    expect(text).toContain(money(bonds));
    expect(text).toContain(money(total));
    expect(text).toContain(`${Math.round((stocks / total) * 100)}% of the portfolio`);
    const target = 0.6 * total;
    expect(text).toContain(money(target));
    expect(text).toContain(`sell ${money(stocks - target)}`);
    expect(text).toContain(money(total - target));
    const rebalanced = target * 0.8 + (total - target);
    const drifted = stocks * 0.8 + bonds;
    expect(text).toContain(money(Math.round(rebalanced)));
    expect(text).toContain(money(Math.round(drifted)));
    expect(text).toContain(money(Math.round(rebalanced - drifted)));
  });

  it("moving-average crossover: entry, exit and a whipsaw", () => {
    const text = exampleText(STRATEGIES_LESSONS.maCrossover);
    expect(text).toContain(`${((110 / 80 - 1) * 100).toFixed(1)}% above the low`);
    expect(text).toContain(`≈ ${Math.round((20 / 140) * 100)}% below the peak`);
    expect(text).toContain(`≈ ${((120 / 110 - 1) * 100).toFixed(1)}%`);
    expect(text).toContain(`= ${Math.round((140 / 80 - 1) * 100)}% from low to peak`);
    expect(text).toContain(`≈ ${((4 / 122) * 100).toFixed(1)}%`);
  });

  it("overfitting: lucky winners among many settings", () => {
    const text = exampleText(STRATEGIES_LESSONS.overfitting);
    expect(text).toContain(`= ${10 * 10}.`);
    expect(text).toContain(`= ${100 * 0.05} settings`);
    expect(text).toContain(`≈ ${((1 - 0.95 ** 100) * 100).toFixed(1)}%`);
  });

  it("momentum rotation: ranking, the top 2 and the absolute rule", () => {
    const text = exampleText(STRATEGIES_LESSONS.momentum);
    const pct = (x: number) => `${x > 0 ? "+" : "−"}${Math.abs(Math.round(x * 1000) / 10)}%`;
    const prices = { A: [120, 100], B: [45, 50], C: [66, 60], D: [82, 80] };
    const scores = Object.entries(prices).map(([s, [now, then]]) => ({ s, r: now / then - 1 }));
    for (const { r } of scores) expect(text).toContain(pct(r));
    const ranked = [...scores].sort((a, b) => b.r - a.r).map((x) => x.s);
    expect(ranked).toEqual(["A", "C", "D", "B"]);
    expect(text).toContain("Ranked: A (+20%), C (+10%), D (+2.5%), B (−10%)");
    expect(6 * 21).toBe(126);
    expect(text).toContain("126 sessions");
    expect(text).toContain(`= ${money(10_000 / 2)}`);
    const later = { A: -0.04, B: -0.12, C: 0.03, D: -0.01 };
    const top = Object.entries(later).sort((a, b) => b[1] - a[1]).slice(0, 2);
    expect(top.map(([s]) => s)).toEqual(["C", "D"]);
    expect(top.filter(([, r]) => r > 0).map(([s]) => s)).toEqual(["C"]);
    // Quiz: 3 months of 21 sessions, and 12-1 momentum from $40 to $50.
    expect(3 * 21).toBe(63);
    expect(50 / 40 - 1).toBe(0.25);
    expect(48 / 40 - 1).toBeCloseTo(0.2, 12);
  });

  it("risk parity: inverse-volatility weights and equal contributions", () => {
    const text = exampleText(STRATEGIES_LESSONS.riskParity);
    const weights = (vols: number[]) => {
      const inverse = vols.map((v) => 1 / v);
      const total = inverse.reduce((a, b) => a + b, 0);
      return inverse.map((x) => x / total);
    };
    expect(0.5 * 15).toBe(7.5);
    expect(text).toContain("= 7.5%");
    const two = weights([0.15, 0.3]);
    expect((1 / 0.15).toFixed(2)).toBe("6.67");
    expect((1 / 0.3).toFixed(2)).toBe("3.33");
    expect(1 / 0.15 + 1 / 0.3).toBeCloseTo(10, 10);
    for (const w of two) expect(text).toContain(`≈ ${(w * 100).toFixed(1)}%`);
    expect(two[0] * 0.15).toBeCloseTo(0.1, 12);
    expect(two[1] * 0.3).toBeCloseTo(0.1, 12);
    const three = weights([0.1, 0.2, 0.4]);
    expect(1 / 0.1 + 1 / 0.2 + 1 / 0.4).toBeCloseTo(17.5, 10);
    for (const w of three) expect(text).toContain(`≈ ${(w * 100).toFixed(1)}%`);
    expect(three[0] / three[2]).toBeCloseTo(4, 10);
    // Quiz: 20% and 40% volatility.
    expect(weights([0.2, 0.4]).map((w) => Math.round(w * 100))).toEqual([67, 33]);
  });
});
