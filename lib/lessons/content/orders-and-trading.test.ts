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
