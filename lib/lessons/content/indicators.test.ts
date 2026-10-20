import { describe, expect, it } from "vitest";
import { indicatorSeries } from "../../backtest/rules";
import type { Lesson } from "../types";
import { INDICATORS_LESSONS } from "./indicators";

const text = (lesson: Lesson) => [lesson.example.setup, ...lesson.example.steps, lesson.example.result].join(" ");
const last = (values: number[]) => values[values.length - 1];

describe("the indicators lessons' worked examples", () => {
  it("SMA: a 5-day average of 103, then 105", () => {
    const lesson = INDICATORS_LESSONS.sma as Lesson;
    const closes = [100, 102, 101, 104, 108, 110];
    const sma = indicatorSeries({ kind: "sma", days: 5 }, closes);
    expect(sma[4]).toBeCloseTo(103, 10);
    expect(sma[5]).toBeCloseTo(105, 10);
    expect((100 + 102 + 101 + 104 + 108) / 5).toBe(103);
    expect((515 - 100 + 110) / 5).toBe(105);
    for (const s of ["515", "$103", "525", "$105"]) expect(text(lesson)).toContain(s);
  });

  it("EMA: one 10-day step from $50 to a $55 close", () => {
    const lesson = INDICATORS_LESSONS.ema as Lesson;
    const closes = [...Array(10).fill(50), 55];
    const k = 2 / 11;
    expect(k.toFixed(4)).toBe("0.1818");
    const ema = last(indicatorSeries({ kind: "ema", days: 10 }, closes));
    const sma = last(indicatorSeries({ kind: "sma", days: 10 }, closes));
    expect(ema).toBeCloseTo(k * 55 + (1 - k) * 50, 10);
    expect(ema.toFixed(2)).toBe("50.91");
    expect((k * 55).toFixed(2)).toBe("10.00");
    expect(((1 - k) * 50).toFixed(2)).toBe("40.91");
    expect(sma).toBeCloseTo(50.5, 10);
    for (const s of ["0.1818", "0.8182", "$10.00", "$40.91", "$50.91", "$50.50", "$0.91"]) expect(text(lesson)).toContain(s);
    // Quiz: a 4-day EMA (k = 0.4) from $100 toward $110.
    expect(2 / 5).toBe(0.4);
    expect(0.4 * 110 + 0.6 * 100).toBeCloseTo(104, 10);
  });

  it("RSI: 66.7 from $14 of gains and $7 of losses, then 69.8 after a $2 gain", () => {
    const lesson = INDICATORS_LESSONS.rsi as Lesson;
    // 10 gains of $1.40 ($14 total) and 4 losses of $1.75 ($7 total), then a $2 gain.
    const changes = [1.4, 1.4, -1.75, 1.4, 1.4, -1.75, 1.4, 1.4, -1.75, 1.4, 1.4, -1.75, 1.4, 1.4, 2];
    const closes = changes.reduce((acc, c) => [...acc, acc[acc.length - 1] + c], [100]);
    const rsi = indicatorSeries({ kind: "rsi", days: 14 }, closes);
    expect(rsi.slice(0, 14).every(Number.isNaN)).toBe(true);
    expect(rsi[14]).toBeCloseTo(100 - 100 / 3, 8);
    expect(rsi[14].toFixed(1)).toBe("66.7");

    const gain = (1 * 13 + 2) / 14;
    const loss = (0.5 * 13) / 14;
    expect(gain.toFixed(4)).toBe("1.0714");
    expect(loss.toFixed(4)).toBe("0.4643");
    expect((gain / loss).toFixed(2)).toBe("2.31");
    const next = 100 - 100 / (1 + gain / loss);
    expect(rsi[15]).toBeCloseTo(next, 8);
    expect(next.toFixed(1)).toBe("69.8");
    for (const s of ["$1.00", "$0.50", "66.7", "$1.0714", "$0.4643", "2.31", "69.8"]) expect(text(lesson)).toContain(s);
    // Quiz: average gain 0.60, average loss 0.20.
    expect(100 - 100 / (1 + 0.6 / 0.2)).toBeCloseTo(75, 10);
  });
});
