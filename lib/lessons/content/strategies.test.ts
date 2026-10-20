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
});
