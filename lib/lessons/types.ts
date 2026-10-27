import type { TermKey } from "../glossary";

/**
 * A lesson's text. Every lesson has the same parts in the same order, so
 * every page reads the same way. Its title, one-line definition and group
 * come from the glossary, so the ⓘ popovers and lessons never disagree.
 *
 * Text is plain, with one extra: `[[termKey]]` links to that term's lesson
 * (shown as its title), and `[[termKey|some words]]` shows other words.
 */
export interface Lesson {
  /** "Why it matters": 1–3 paragraphs. */
  why: string[];
  /** "How it works": paragraphs, and the formula if there is one. */
  how: {
    paragraphs: string[];
    /** Shown in a monospace box, with a plain-English reading under it. */
    formula?: { expression: string; reading: string };
  };
  /** "A worked example": real numbers, step by step. */
  example: { setup: string; steps: string[]; result: string };
  /** An interactive demo, if this lesson has one. */
  demo?: DemoKey;
  /** "How to read it": typical values or situations, and what they mean. */
  reading: { label: string; meaning: string }[];
  /** "In the real world": how investors, funds and companies actually use it. */
  realWorld: string[];
  /** "Common mistakes". */
  mistakes: string[];
  /** "See it in MarketLab": where to find it in the app. */
  inMarketLab: { label: string; href: string; text: string }[];
  /** 2–4 other lessons to read next. */
  related: TermKey[];
  /** "Test yourself": an optional short quiz. */
  quiz: Question[];
}

/** What a question tests: the words, using the idea, or how it plays out in real markets. */
export type QuestionKind = "Terminology" | "Using it" | "Real world";

export interface Question {
  kind: QuestionKind;
  prompt: string;
  /** 3 or 4 choices. */
  choices: string[];
  /** The index of the right choice. */
  answer: number;
  /** Shown after answering: why the right choice is right. */
  explanation: string;
}

/** The interactive demos (components/learn/demos). */
export type DemoKey =
  | "growth"
  | "diversification"
  | "volatility"
  | "drawdown"
  | "sharpe"
  | "beta"
  | "benchmark"
  | "volatilityClustering"
  | "disposition"
  | "orders"
  | "tradingCosts"
  | "dividend"
  | "split"
  | "companySize"
  | "movingAverage"
  | "rsi"
  | "dollarCostAveraging"
  | "rebalancing"
  | "overfitting"
  | "factors"
  | "optionPayoff"
  | "optionGreeks"
  | "impliedVolatility"
  | "optionStrategies";
