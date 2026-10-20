import { describe, expect, it } from "vitest";
import type { TermKey } from "../../glossary";
import { INVESTING_BASICS_LESSONS } from "./investing-basics";

const text = (key: TermKey) => {
  const l = INVESTING_BASICS_LESSONS[key]!;
  return [l.example.setup, ...l.example.steps, l.example.result].join(" ");
};
const dollars = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

describe("investing basics worked examples", () => {
  it("compounding", () => {
    const early = 5_000 * 1.07 ** 40;
    const late = 5_000 * 1.07 ** 30;
    const simple = 5_000 + 5_000 * 0.07 * 40;
    const t = text("compounding");
    expect(t).toContain((1.07 ** 40).toFixed(2));
    expect(t).toContain((1.07 ** 30).toFixed(2));
    expect(t).toContain(dollars(early));
    expect(t).toContain(dollars(late));
    expect(t).toContain(dollars(5_000 * 0.07));
    expect(t).toContain(dollars(simple));
  });

  it("diversification", () => {
    const concentrated = 10_000 * 0.4;
    const bad = 500 * 0.4;
    const others = 19 * 500 * 1.08;
    const total = others + bad;
    const t = text("diversification");
    expect(t).toContain(dollars(concentrated));
    expect(t).toContain(dollars(bad));
    expect(t).toContain(dollars(others));
    expect(t).toContain(dollars(total));
    expect(t).toContain(dollars(500 - bad));
    expect(t).toContain(`${((total / 10_000 - 1) * 100).toFixed(1)}%`);
  });

  it("etf", () => {
    const cheap = 10_000 * 1.0695 ** 30;
    const pricey = 10_000 * 1.06 ** 30;
    const t = text("etf");
    expect(t).toContain(dollars(cheap));
    expect(t).toContain(dollars(pricey));
    expect(t).toContain(dollars(Math.round(cheap) - Math.round(pricey)));
  });
});
