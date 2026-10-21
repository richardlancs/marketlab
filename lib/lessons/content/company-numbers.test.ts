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

  it("revenue", () => {
    const t = text("revenue");
    const gross = 10 - 6;
    const operating = gross - 2.5;
    const pretax = operating - 0.2;
    const net = pretax * 0.8;
    expect(t).toContain(`= $${gross} billion`);
    expect(t).toContain(`= $${operating} billion`);
    expect(t).toContain(`= $${pretax.toFixed(1)} billion`);
    expect(t).toContain(`$${(pretax * 0.2).toFixed(2)} billion, so net income is $${net.toFixed(2)} billion`);
    expect(t).toContain(`= $${((net * 1e9) / 400e6).toFixed(2)}`);
  });

  it("margins", () => {
    const t = text("margins");
    expect(t).toContain(`${((20 - 4) / 20) * 100}%`);
    expect(t).toContain(`${((20 - 15) / 20) * 100}%`);
    expect(t).toContain(`$6 billion ÷ $20 billion = ${(6 / 20) * 100}%`);
    expect(t).toContain(`$0.8 billion ÷ $20 billion = ${(0.8 / 20) * 100}%`);
    expect(t).toContain(`$5 billion ÷ $20 billion = ${(5 / 20) * 100}%`);
    expect(t).toContain(`$0.5 billion ÷ $20 billion = ${(0.5 / 20) * 100}%`);
    expect(t).toContain(`fall to $${20 * 0.02} billion, down ${Math.round((1 - (20 * 0.02) / 0.5) * 100)}%`);
  });

  it("returnOnEquity", () => {
    const t = text("returnOnEquity");
    expect(t).toContain(`$2 billion ÷ $10 billion = ${(2 / 10) * 100}%`);
    expect(t).toContain(`= $${10 - 4} billion`);
    expect(t).toContain(`= $${(2 - 0.2).toFixed(1)} billion`);
    expect(t).toContain(`$1.8 billion ÷ $6 billion = ${Math.round((1.8 / 6) * 100)}%`);
  });

  it("freeCashFlow", () => {
    const t = text("freeCashFlow");
    const fcf = 8 - 3;
    expect(t).toContain(`$8 billion − $3 billion = $${fcf} billion`);
    expect(t).toContain(`$${fcf} billion ÷ $100 billion = ${(fcf / 100) * 100}%`);
    expect(t).toContain(`leaving $5 billion − $2 billion − $2 billion = $${fcf - 4} billion`);
    expect(t).toContain(`$8 billion − $7 billion = $${8 - 7} billion, a yield of ${((8 - 7) / 100) * 100}%`);
  });
});
