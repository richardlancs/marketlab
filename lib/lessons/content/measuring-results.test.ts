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
});
