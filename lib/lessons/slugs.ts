/**
 * The address of each lesson: /learn/<slug>. Kept apart from the lesson text
 * so proxy.ts can check an address without loading every lesson.
 */
import type { TermKey } from "../glossary";

export const LESSON_SLUGS = {
  compounding: "compounding",
  diversification: "diversification",
  etf: "etfs-and-index-funds",
  totalReturn: "total-return",
  cagr: "annual-return-cagr",
  volatility: "volatility",
  maxDrawdown: "max-drawdown",
  valueAtRisk: "value-at-risk",
  sharpe: "sharpe-ratio",
  correlation: "correlation",
  beta: "beta",
  benchmark: "benchmark",
  exposure: "time-invested",
  monteCarlo: "monte-carlo",
  marketOrder: "market-order",
  limitOrder: "limit-order",
  stopOrder: "stop-order",
  tradingCosts: "trading-costs",
  dividend: "dividends",
  split: "stock-splits",
  adjustedPrice: "adjusted-price",
  marketCap: "market-cap",
  peRatio: "pe-ratio",
  dividendYield: "dividend-yield",
  revenue: "revenue-and-earnings",
  margins: "profit-margins",
  returnOnEquity: "return-on-equity",
  freeCashFlow: "free-cash-flow",
  sma: "moving-average",
  ema: "exponential-moving-average",
  rsi: "rsi",
  macd: "macd",
  bollingerBands: "bollinger-bands",
  buyAndHold: "buy-and-hold",
  dollarCostAveraging: "dollar-cost-averaging",
  rebalancing: "rebalancing",
  maCrossover: "moving-average-crossover",
  momentum: "momentum-rotation",
  riskParity: "risk-parity",
  overfitting: "overfitting",
} as const satisfies Record<TermKey, string>;

const BY_SLUG = new Map<string, TermKey>(Object.entries(LESSON_SLUGS).map(([key, slug]) => [slug, key as TermKey]));

/** The term a lesson address is about, or undefined if there's no such lesson. */
export const termForSlug = (slug: string): TermKey | undefined => BY_SLUG.get(slug);

export const lessonHref = (term: TermKey) => `/learn/${LESSON_SLUGS[term]}`;
