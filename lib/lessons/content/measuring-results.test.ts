import { describe, expect, it } from "vitest";
import { plainText } from "../rich-text";
import type { Lesson } from "../types";
import { MEASURING_RESULTS_LESSONS } from "./measuring-results";

/** The worked example and the rest of the lesson's reader-visible text, as plain text. */
function text(lesson: Lesson | undefined): string {
  if (!lesson) throw new Error("missing lesson");
  return [
    ...lesson.why,
    ...lesson.how.paragraphs,
    lesson.example.setup,
    ...lesson.example.steps,
    lesson.example.result,
    ...lesson.reading.map((r) => r.meaning),
    ...lesson.realWorld,
    ...lesson.mistakes,
    ...lesson.quiz.flatMap((q) => [q.prompt, ...q.choices, q.explanation]),
  ]
    .map(plainText)
    .join("\n");
}

const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

describe("measuring results worked examples", () => {
  it("total return", () => {
    const t = text(MEASURING_RESULTS_LESSONS.totalReturn);
    const afterOne = 10_000 * 1.3;
    const afterTwo = afterOne * 0.9;
    expect(t).toContain(usd(afterOne));
    expect(t).toContain(usd(afterTwo));
    expect(t).toContain(`+${pct(afterTwo / 10_000 - 1)}`);
    expect(t).toContain(usd(afterOne - afterTwo));
    expect(1.2 * 0.8 - 1).toBeCloseTo(-0.04);
    expect(t).toContain(`+${pct(10_000 / 8_000 - 1)}`);
    expect(1.5 * 0.5).toBe(0.75); // "+50% then −50% leaves you 25% down"
  });

  it("CAGR", () => {
    const t = text(MEASURING_RESULTS_LESSONS.cagr);
    expect(t).toContain(usd(10_000 * 1.1 ** 5));
    expect((16_105 / 10_000) ** (1 / 5) - 1).toBeCloseTo(0.1, 4);
    const bumpy = 0.75 ** 0.5;
    expect(t).toContain(bumpy.toFixed(3));
    expect(t).toContain(pct(1 - bumpy, 1));
    expect(Math.sqrt(1.21)).toBeCloseTo(1.1);
    expect(t).toContain(`about −${pct(1 - Math.sqrt(1.4 * 0.7))} a year`);
    expect(t).toContain(`+${pct(1.1 ** 4 - 1)} a year`);
    expect(t).toContain(`about ${pct(2 ** (1 / 10) - 1, 1)} a year`);
  });

  it("volatility", () => {
    const t = text(MEASURING_RESULTS_LESSONS.volatility);
    const days = [0.01, -0.01, 0.02, -0.02, 0];
    const mean = days.reduce((a, b) => a + b, 0) / days.length;
    const sd = Math.sqrt(days.reduce((a, r) => a + (r - mean) ** 2, 0) / (days.length - 1));
    expect(t).toContain(pct(sd, 2));
    expect(t).toContain(Math.sqrt(252).toFixed(2));
    expect(t).toContain(pct(sd * Math.sqrt(252), 1));
    expect(t).toContain(pct(0.02 * Math.sqrt(252)));
  });

  it("max drawdown", () => {
    const t = text(MEASURING_RESULTS_LESSONS.maxDrawdown);
    expect(t).toContain(`a ${pct(1 - 9_000 / 15_000)} fall`);
    expect(t).toContain(pct(15_000 / 9_000 - 1, 1));
    const recover = (d: number) => 1 / (1 - d) - 1;
    expect(t).toContain(pct(recover(0.1), 1));
    expect(t).toContain(pct(recover(0.2)));
    expect(t).toContain(`${pct(recover(0.5))} gain`);
    expect(t).toContain(`${pct(recover(0.8))} gain`);
    expect(t).toContain(`about ${pct(recover(0.3))}`);
    expect(t).toContain(`−${pct(1 - 20_000 / 25_000)}`);
  });

  it("beta", () => {
    const t = text(MEASURING_RESULTS_LESSONS.beta);
    expect(t).toContain(String(30 / 16));
    expect(0.8 * (30 / 16)).toBeCloseTo(1.5);
    const utility = 0.5 * (18 / 16);
    expect(t).toContain(String(18 / 16));
    expect(t).toContain(utility.toFixed(2));
    expect(t).toContain(pct(utility * 0.1, 1));
    expect(t).toContain(`about ${(1.5 / utility).toFixed(1)} times`);
    expect(0.5 * (40 / 20)).toBe(1);
  });

  it("benchmark", () => {
    const t = text(MEASURING_RESULTS_LESSONS.benchmark);
    expect(t).toContain(`+${pct(14_000 / 10_000 - 1)}`);
    expect(t).toContain(`+${pct(16_000 / 10_000 - 1)}`);
    expect(t).toContain(String(14_000 / 16_000));
    expect(t).toContain(pct(1 - 14_000 / 16_000, 1));
    expect(t).toContain(`+${pct(15_000 / 10_000 - 1)}`);
  });

  it("time invested", () => {
    const t = text(MEASURING_RESULTS_LESSONS.exposure);
    expect(t).toContain(pct(819 / 1_260));
    expect(t).toContain(String(1_260 - 819));
    expect(t).toContain(`about ${pct(1 - 819 / 1_260)}`);
    expect(t).toContain(pct(315 / 1_260));
  });

  it("Sharpe ratio", () => {
    const t = text(MEASURING_RESULTS_LESSONS.sharpe);
    expect(t).toContain((0.0005 / 0.012 * Math.sqrt(252)).toFixed(2));
    expect(t).toContain((0.0005 / 0.006 * Math.sqrt(252)).toFixed(2));
  });

  it("correlation", () => {
    const t = text(MEASURING_RESULTS_LESSONS.correlation);
    const a = [1, -1, 2, -2, 0];
    const b = [2, 0, 1, -1, -2];
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(a)).toBe(0);
    expect(mean(b)).toBe(0);
    const products = a.reduce((s, x, i) => s + x * b[i], 0);
    const squaresA = a.reduce((s, x) => s + x * x, 0);
    const squaresB = b.reduce((s, x) => s + x * x, 0);
    expect(t).toContain(`= ${products}.`);
    expect(t).toContain(`= ${squaresA};`);
    expect(t).toContain(`= ${squaresB}.`);
    const correlation = products / Math.sqrt(squaresA * squaresB);
    expect(correlation).toBe(0.6);
    expect(t).toContain(`= ${correlation}.`);
    const mix = (rho: number, vol = 0.2) => vol * Math.sqrt((1 + rho) / 2);
    expect(t).toContain(`≈ ${pct(mix(0.6), 1)}`);
    expect(t).toContain(`≈ ${pct(mix(0), 1)}`);
    expect(mix(1)).toBeCloseTo(0.2, 12);
    // Quiz: 30% volatility at a correlation of 0.2.
    expect(t).toContain(`≈ ${pct(mix(0.2, 0.3))}`);
  });

  it("Value at Risk", () => {
    const t = text(MEASURING_RESULTS_LESSONS.valueAtRisk);
    const worst = [4.0, 3.2, 2.8, 2.5, 2.1];
    expect(Math.round(100 * 0.05)).toBe(worst.length);
    expect(t).toContain(usd(50_000 * 0.021));
    const sum = worst.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(14.6, 10);
    const shortfall = sum / worst.length;
    expect(t).toContain(`${shortfall.toFixed(2)}%`);
    expect(t).toContain(usd((50_000 * shortfall) / 100));
    expect(t).toContain(`≈ ${(1.645 * 1.2).toFixed(2)}%`);
    expect(4.0 / 1.2).toBeGreaterThan(3);
    expect(t).toContain(usd(50_000 * 0.04));
    expect(t).toContain(`about 12 or 13 days`);
    expect(252 * 0.05).toBeCloseTo(12.6, 10);
    // Quiz: the average of the five worst losses.
    expect((5 + 4 + 3 + 3 + 2) / 5).toBe(3.4);
  });

  it("Monte Carlo simulation", () => {
    const t = text(MEASURING_RESULTS_LESSONS.monteCarlo);
    const one = 1.02 * 0.95 * 1.03;
    const two = 1.03 * 1.02 * 1.02;
    expect(t).toContain(`≈ ${one.toFixed(3)}`);
    expect(t).toContain(`≈ ${two.toFixed(3)}`);
    expect(t).toContain(usd(10_000 * one));
    expect(t).toContain(usd(10_000 * two));
    expect(10_000 * (two - one)).toBeGreaterThan(700);
    expect(t).toContain(`${2_000 * 0.25}th to the ${(2_000 * 0.75).toLocaleString("en-US")}th`);
    expect(t).toContain(`${2_000 * 0.05}th to the ${(2_000 * 0.95).toLocaleString("en-US")}th`);
    expect(t).toContain(`= ${pct(260 / 2_000)}`);
    // Quiz: 300 of 2,000 paths below the start.
    expect(300 / 2_000).toBe(0.15);
  });

  it("factor investing", () => {
    const t = text(MEASURING_RESULTS_LESSONS.factors);
    const betas = [1.2, -0.3, -0.5, 0.4, -0.2];
    const returns = [10, -2, -4, 6, -3];
    const parts = betas.map((b, i) => Math.round(b * returns[i] * 10) / 10);
    expect(parts).toEqual([12, 0.6, 2, 2.4, 0.6]);
    expect(t).toContain("1.2 × 10% = +12%");
    expect(t).toContain("−0.3 × −2% = +0.6%");
    expect(t).toContain("−0.5 × −4% = +2%");
    expect(t).toContain("0.4 × 6% = +2.4%");
    expect(t).toContain("−0.2 × −3% = +0.6%");
    const explained = parts.reduce((a, b) => a + b, 0);
    expect(explained).toBeCloseTo(17.6, 10);
    expect(t).toContain(`= ${explained.toFixed(1)}%`);
    expect(t).toContain(`19% − 17.6% = ${(19 - explained).toFixed(1)}%`);
    // Quiz: a market beta of 0.8 and a +15% market.
    expect(0.8 * 15).toBeCloseTo(12, 10);
  });

  it("alpha", () => {
    const t = text(MEASURING_RESULTS_LESSONS.alpha);
    expect(t).toContain(`about ${Math.round(0.0002 * 252 * 100)}% a year`);
    expect(t).toContain(`1.1 × 10% = ${Math.round(1.1 * 10)}%`);
    expect(t).toContain(`0.5 × 4% = ${0.5 * 4}%`);
    expect(t).toContain(`14% − 13% = ${14 - 13}%`);
    expect(t).toContain(`1% ÷ 8% = ${1 / 8}`);
    expect(t).toContain(`(2 × 8 ÷ 1)² = ${(2 * 8) ** 2} years`);
    // A 20% residual volatility over one year: an alpha of +10% has a t-statistic of 0.5.
    expect(0.1 / (0.2 / Math.sqrt(1))).toBe(0.5);
    // Quiz: 0.9 × 10% explains all of a 9% return.
    expect(9 - 0.9 * 10).toBeCloseTo(0, 10);
  });

  it("luck or skill", () => {
    const t = text(MEASURING_RESULTS_LESSONS.luck);
    expect(t).toContain(`710 ÷ 1,000 = ${pct(710 / 1_000)}`);
    expect(t).toContain(`100% − 71% = ${pct(1 - 0.71)}`);
    expect(t).toContain(`1,260 ÷ 21 = ${1_260 / 21} blocks`);
    expect(t).toContain(`2,000 × 5% = ${2_000 * 0.05}th`);
    expect(t).toContain(`the ${(2_000 * 0.95).toLocaleString("en-US")}th`);
    expect(t).toContain(`1 − 0.95²⁰ ≈ ${pct(1 - 0.95 ** 20)}`);
    // Quiz: the middle 90% of 2,000 values, and 1 − 80% left to luck.
    expect([2_000 * 0.05, 2_000 * 0.95]).toEqual([100, 1_900]);
  });

  it("volatility clustering", () => {
    const t = text(MEASURING_RESULTS_LESSONS.volatilityClustering);
    const [alpha, beta] = [0.09, 0.89];
    const base = 1 - alpha - beta;
    expect(t).toContain(`(1 − 0.09 − 0.89) × 1 = ${base.toFixed(2)}`);
    expect(t).toContain(`0.09 × 4² = 0.09 × 16 = ${alpha * 16}`);
    const variance = base + alpha * 16 + beta * 1;
    expect(t).toContain(`0.02 + 1.44 + 0.89 = ${variance.toFixed(2)}`);
    const vol = Math.sqrt(variance);
    expect(t).toContain(`√2.35 ≈ ${vol.toFixed(2)}%`);
    expect(t).toContain(`≈ ${(1.53 * Math.sqrt(252)).toFixed(1)}% a year`);
    expect(t).toContain(`$${(100 - 1.53).toFixed(2)} and $${(100 + 1.53).toFixed(2)}`);
    expect(t).toContain(`±${(1.645 * 1.53).toFixed(2)}%`);
    expect(t).toContain(`from $${(100 - 2.52).toFixed(2)} to $${(100 + 2.52).toFixed(2)}`);
    expect(t).toContain(`log(0.5) ÷ log(0.98) ≈ ${Math.round(Math.log(0.5) / Math.log(0.98))} sessions`);
    // Quiz: alpha 0.1 and beta 0.85.
    expect(Math.round(Math.log(0.5) / Math.log(0.95))).toBe(14);
  });
});
