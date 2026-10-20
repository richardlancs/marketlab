import { describe, expect, it } from "vitest";
import type { TermKey } from "../../glossary";
import { COMPANY_NUMBERS_LESSONS } from "./company-numbers";

const text = (key: TermKey) => {
  const l = COMPANY_NUMBERS_LESSONS[key]!;
  return [l.example.setup, ...l.example.steps, l.example.result].join(" ");
};
const billions = (v: number) => `$${v / 1e9} billion`;

describe("company numbers worked examples", () => {
  it("marketCap", () => {
    const t = text("marketCap");
    expect(t).toContain(billions(50 * 2e9));
    expect(t).toContain(billions(500 * 100e6));
    expect(t).toContain(billions(250 * 200e6));
    expect(t).toContain(billions(55 * 2e9));
  });

  it("peRatio", () => {
    const t = text("peRatio");
    expect(t).toContain(`a P/E of ${60 / 3}`);
    expect(t).toContain(`${(3 / 60) * 100}%`);
    expect(t).toContain(`a P/E of ${60 / 1.5}`);
    const later = 1.5 * 1.25 ** 3;
    expect(t).toContain(`$${later.toFixed(2)}`);
    expect(t).toContain(`≈ ${(60 / Number(later.toFixed(2))).toFixed(1)}`);
  });

  it("dividendYield", () => {
    const t = text("dividendYield");
    const yearly = 0.6 * 4;
    expect(t).toContain(`$${yearly.toFixed(2)} a share`);
    expect(t).toContain(`${(yearly / 80) * 100}%`);
    expect(t).toContain(`$${yearly * 100} a year, $${yearly * 25} each quarter`);
    expect(t).toContain(`${((yearly / 50) * 100).toFixed(1)}%`);
    expect(t).toContain(`${((yearly / 2 / 50) * 100).toFixed(1)}%`);
    expect(t).toContain(`$${(yearly / 2) * 100} a year`);
  });
});
