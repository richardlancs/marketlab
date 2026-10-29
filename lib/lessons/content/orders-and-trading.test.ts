import { describe, expect, it } from "vitest";
import type { Lesson } from "../types";
import { ORDERS_AND_TRADING_LESSONS } from "./orders-and-trading";

/** The worked example's text, where its numbers appear. */
function exampleText(lesson: Lesson | undefined): string {
  if (!lesson) throw new Error("missing lesson");
  return [lesson.example.setup, ...lesson.example.steps, lesson.example.result].join(" ");
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, digits: number) => `${(n * 100).toFixed(digits)}%`;

describe("orders and trading worked examples", () => {
  it("market order", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.marketOrder);
    expect(text).toContain(usd(10 * 150));
    expect(text).toContain(usd(2000 - 10 * 150));
    expect(text).toContain(usd(10 * 150.02));
    expect(text).toContain(usd(10 * 150.02 - 10 * 150));
    expect(text).toContain(usd(10 * 149.98));
    expect(text).toContain(usd(10 * 150.02 - 10 * 149.98));
  });

  it("limit order", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.limitOrder);
    expect(text).toContain(usd(20 * 47.6));
    expect(text).toContain(usd(20 * 48));
    expect(text).toContain(usd(20 * 50));
    expect(text).toContain(`paid ${usd(20 * 50 - 20 * 47.6)} less`);
    expect(text).toContain(usd(48 - 47.6));
  });

  it("stop order", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.stopOrder);
    expect(text).toContain(usd(10 * 80));
    expect(text).toContain(usd(10 * 100));
    expect(text).toContain(`loss is ${usd(10 * 100 - 10 * 80)}`);
    expect(text).toContain(`= ${usd(10 * (100 - 90))}`);
    expect(text).toContain(`another ${usd(10 * 100 - 10 * 80 - 10 * (100 - 90))}`);
  });

  it("trailing stop", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.trailingStop);
    const trail = (high: number) => high * (1 - 0.1);
    expect(text).toContain(`at ${usd(trail(50))}`);
    expect(text).toContain(`rises to ${usd(trail(55))}`);
    expect(text).toContain(`rises to ${usd(trail(60))}`);
    expect(text).toContain(`20 × $60.00 = ${usd(20 * 60)}`);
    expect(57).toBeGreaterThan(trail(60));
    expect(53).toBeLessThanOrEqual(trail(60));
    expect(text).toContain(`20 × $53.00 = ${usd(20 * 53)}, a profit of ${usd(20 * 53 - 20 * 50)}`);
    expect(text).toContain(`= ${usd(20 * trail(60) - 20 * 50)}`);
  });

  it("bracket order", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.bracketOrder);
    const risk = 50 * (40 - 38);
    const reward = 50 * (46 - 40);
    expect(text).toContain(usd(50 * 40));
    expect(text).toContain(`= ${usd(risk)}`);
    expect(text).toContain(`= ${usd(reward)}, or ${reward / risk} to 1`);
    expect(text).toContain(pct(risk / (risk + reward), 0));
    expect(46.8).toBeGreaterThanOrEqual(46);
    expect(text).toContain(`50 × $46.80 = ${usd(50 * 46.8)}, a profit of ${usd(50 * 46.8 - 50 * 40)}`);
    expect(text).toContain(`= ${usd(50 * (40 - 37.5))}`);
  });

  it("position sizing", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.positionSizing);
    const risk = 0.01 * 10_000;
    expect(text).toContain(`or ${usd(risk)}`);
    expect(text).toContain(`$100.00 ÷ $4.00 = ${risk / (80 - 76)} shares`);
    expect(text).toContain(`25 × $80.00 = ${usd(25 * 80)}, or ${pct((25 * 80) / 10_000, 0)}`);
    expect(text).toContain(`${risk / (80 - 78)} shares for ${usd((risk / (80 - 78)) * 80)}`);
    expect(text).toContain(`${(risk / 3).toFixed(1)}, so you buy ${Math.floor(risk / 3)} shares`);
    expect(text).toContain(`= ${usd(Math.floor(risk / 3) * 3)}`);
    expect(text).toContain(`= ${usd(25 * (80 - 72))}, or ${pct((25 * (80 - 72)) / 10_000, 0)}`);
  });

  it("short selling", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.shortSelling);
    const proceeds = 100 * 50;
    expect(text).toContain(usd(proceeds));
    expect(text).toContain(usd(1.5 * proceeds));
    expect(text).toContain(`plus ${usd(0.5 * proceeds)}`);
    expect(text).toContain(`÷ 252 = ${usd((0.03 * proceeds) / 252)}`);
    expect(text).toContain(`for ${usd(100 * 40)}. That's ${usd(proceeds - 100 * 40)}`);
    const fees = (21 * 0.03 * 4_500) / 252;
    expect(text).toContain(`= ${usd(fees)}, leaving ${usd(proceeds - 100 * 40 - fees)}`);
    expect(text).toContain(`cost ${usd(100 * 65)}, a loss of ${usd(100 * 65 - proceeds)}`);
    expect(text).toContain(`= ${usd(1.5 * 100 * 65)}`);
  });

  it("margin call", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.margin);
    const cash = 10_000 + 300 * 50;
    expect(text).toContain(usd(cash));
    expect(text).toContain(usd(300 * 50));
    expect(text).toContain(`÷ 390 = ${usd(cash / (300 * (1 + 0.3)))}`);
    const shorts = 300 * 70;
    const equity = cash - shorts;
    expect(text).toContain(`300 × $70.00 = ${usd(shorts)}`);
    expect(text).toContain(`= ${usd(equity)}`);
    expect(text).toContain(`required is ${usd(0.3 * shorts)}`);
    // The same rule as lib/processing.ts: buy back ceil(deficit ÷ price) shares.
    const bought = Math.ceil((shorts - equity / 0.3) / 70 - 1e-9);
    const left = 300 - bought;
    expect(left).toBe(Math.floor(equity / (0.3 * 70)));
    expect(text).toContain(`at most ${left} shares`);
    expect(text).toContain(`buys back ${bought} shares at $70.00, for ${usd(bought * 70)}`);
    expect(text).toContain(`cash ${usd(cash - bought * 70)}, a short of ${left} shares worth ${usd(left * 70)}`);
    expect(cash - bought * 70 - left * 70).toBe(equity);
    expect(text).toContain(`= ${usd(0.3 * left * 70)}`);
    expect(0.3 * left * 70).toBeLessThanOrEqual(equity);
  });

  it("trading costs", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.tradingCosts);
    const slip = 5 / 10_000;
    const perTrade = slip * 10_000 + 1;
    expect(text).toContain(usd(slip * 10_000));
    expect(text).toContain(usd(100 * (1 + slip)));
    expect(text).toContain(usd(perTrade));
    expect(text).toContain(usd(50 * perTrade));
    expect(text).toContain(pct((50 * perTrade) / 10_000, 0));
    expect(text).toContain(pct(perTrade / 10_000, 2));
  });

  it("dividend", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.dividend);
    expect(text).toContain(usd(40 * 60));
    expect(text).toContain(usd(40 * 0.5));
    expect(text).toContain(usd(40 * 59.5));
    expect(text).toContain(usd(40 * 59.5 + 40 * 0.5));
    expect(40 * 59.5 + 40 * 0.5).toBe(40 * 60);
    expect(text).toContain(usd(4 * 0.5));
    expect(text).toContain(pct((4 * 0.5) / 60, 1));
  });

  it("split", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.split);
    expect(text).toContain(`${10 * 3} shares`);
    expect(text).toContain(usd(600 / 3));
    expect(text).toContain(usd(30 * 200));
    expect(30 * 200).toBe(10 * 600);
    expect(text).toContain(usd(450 / 3));
    expect(text).toContain(usd(30 * (200 - 150)));
    expect(30 * (200 - 150)).toBe(10 * (600 - 450));
    expect(text).toContain(`${7 * 1.5}`);
    expect(text).toContain(usd((7 * 1.5 - Math.floor(7 * 1.5)) * 80));
  });

  it("adjusted price", () => {
    const text = exampleText(ORDERS_AND_TRADING_LESSONS.adjustedPrice);
    expect(text).toContain(`−${pct((400 - 102) / 400, 1)}`);
    expect(text).toContain(usd(400 / 4));
    expect(text).toContain(pct((102 - 100) / 100, 0));
    expect(text).toContain(pct((60 - 59.7) / 60, 1));
    const factor = 1 - 0.6 / 60;
    expect(text).toContain(`= ${factor.toFixed(2)},`);
    expect(text).toContain(usd(60 * factor));
    expect(text).toContain(pct(59.7 / (60 * factor) - 1, 2));
    expect(text).toContain(`= ${((59.7 + 0.6) / 60).toFixed(3)}`);
  });
});
