import { describe, expect, it } from "vitest";
import { blackScholes, impliedVolatility, profitAtExpiry, type Leg } from "../demos";
import type { Lesson } from "../types";
import { OPTIONS_LESSONS } from "./options";

/** Everything in a lesson's worked example, as one string. */
const exampleText = (lesson: Lesson | undefined) => {
  if (!lesson) throw new Error("missing lesson");
  return [lesson.example.setup, ...lesson.example.steps, lesson.example.result].join(" ");
};
const money = (v: number) => `$${v.toFixed(2)}`;
/** The lessons' example: a $100 stock, 3 months, 20% volatility, a 4% rate. */
const base = { spot: 100, strike: 100, years: 0.25, volatility: 0.2, rate: 0.04 };

describe("options worked examples", () => {
  it("calls and puts: a $105 call bought for $3", () => {
    const text = exampleText(OPTIONS_LESSONS.callsAndPuts);
    const call: Leg = { kind: "call", strike: 105, premium: 3, quantity: 1 };
    expect(profitAtExpiry([call], 115)).toBe(7);
    expect(text).toContain(`+${Math.round((700 / 300) * 100)}%`);
    expect(text).toContain(`$1,500, or +${(1_500 / 10_000) * 100}%`);
    expect(profitAtExpiry([call], 106)).toBe(-2);
    expect(profitAtExpiry([call], 100)).toBe(-3);
    expect(text).toContain("$105 + $3 = $108");
    // Quiz: a $50 put bought for $2, with the stock at $44.
    expect(profitAtExpiry([{ kind: "put", strike: 50, premium: 2, quantity: 1 }], 44)).toBe(4);
  });

  it("the Greeks: Black-Scholes values and the estimates from them", () => {
    const text = exampleText(OPTIONS_LESSONS.optionGreeks);
    const call = blackScholes("call", base);
    expect(text).toContain(`worth ${money(call.price)}`);
    expect(text).toContain(`delta ${call.delta.toFixed(2)}`);
    expect(text).toContain(`gamma ${call.gamma.toFixed(3)}`);
    expect(text).toContain(`theta −$${(-call.theta).toFixed(3)}`);
    expect(text).toContain(`vega ${money(call.vega)}`);
    expect(text).toContain(`rho ${money(call.rho)}`);
    expect(text).toContain(`The full model gives ${money(blackScholes("call", { ...base, spot: 102 }).price)}`);
    expect(text).toContain(`The full model gives ${money(blackScholes("call", { ...base, volatility: 0.25 }).price)}`);
    expect(0.56 * 2).toBeCloseTo(1.12, 10);
    expect(0.5 * 0.039 * 4).toBeCloseTo(0.078, 10);
    expect(text).toContain(`put is worth ${money(blackScholes("put", base).price)}`);
    expect(blackScholes("call", { ...base, spot: 102 }).price / call.price - 1).toBeCloseTo(0.27, 2);
  });

  it("implied volatility: the guesses and the answer", () => {
    const text = exampleText(OPTIONS_LESSONS.impliedVolatility);
    const at = (volatility: number) => money(blackScholes("call", { ...base, volatility }).price);
    expect(text).toContain(`Try 20%: Black-Scholes gives ${at(0.2)}`);
    expect(text).toContain(`Try 30%: the model gives ${at(0.3)}`);
    expect(text).toContain(`Try 25%: the model gives ${at(0.25)}`);
    const short = 5.5 - blackScholes("call", { ...base, volatility: 0.25 }).price;
    expect(short.toFixed(3)).toBe("0.028");
    expect(short / blackScholes("call", { ...base, volatility: 0.25 }).vega).toBeCloseTo(0.14, 2);
    const solved = impliedVolatility("call", 5.5, { spot: 100, strike: 100, years: 0.25, rate: 0.04 })!.volatility;
    expect(text).toContain(`about ${(solved * 100).toFixed(1)}%`);
  });

  it("option strategies: spread, covered call, protective put and straddle", () => {
    const text = exampleText(OPTIONS_LESSONS.optionStrategies);
    const c100 = blackScholes("call", base).price;
    const c110 = blackScholes("call", { ...base, strike: 110 }).price;
    const p100 = blackScholes("put", base).price;
    const p90 = blackScholes("put", { ...base, strike: 90 }).price;
    for (const p of [c100, c110, p100, p90]) expect(text).toContain(money(p));
    const [a, b, c, d] = [4.49, 1.14, 3.49, 0.58];
    const spread: Leg[] = [
      { kind: "call", strike: 100, premium: a, quantity: 1 },
      { kind: "call", strike: 110, premium: b, quantity: -1 },
    ];
    expect(text).toContain(money(a - b));
    expect(text).toContain(`$10 − $3.35 = ${money(profitAtExpiry(spread, 120))}`);
    expect(text).toContain(money(100 + a - b));
    const stock: Leg = { kind: "stock", price: 100, quantity: 1 };
    expect(text).toContain(money(profitAtExpiry([stock, spread[1]], 120)));
    expect(text).toContain(money(-profitAtExpiry([stock, spread[1]], 90)));
    expect(text).toContain(money(-profitAtExpiry([stock, { kind: "put", strike: 90, premium: d, quantity: 1 }], 50)));
    expect(text).toContain(`${money(a)} + ${money(c)} = ${money(a + c)}`);
    expect(text).toContain(money(100 - a - c));
    expect(text).toContain(money(100 + a + c));
    // "$0.58 × 4 = $2.32" a year of puts, in the real-world notes.
    expect(d * 4).toBeCloseTo(2.32, 10);
  });
});
