/**
 * The machine-learning sandbox's settings and results, as the analytics
 * service runs it (services/analytics/analytics/ml.py). Types, parsers and
 * the lists the form offers, so server and browser code share them.
 */
import { MAX_RUN_NAME } from "../backtest/config";
import type { SelectionCheck } from "../backtest/sweep";
import type { StoredInfo } from "../backtest/config";

export const ML_FEATURES = {
  return1w: "Return, last week",
  return1m: "Return, last 4 weeks",
  return3m: "Return, last 13 weeks",
  rsi: "RSI (14 days)",
  macd: "MACD histogram",
  gap50: "Gap to 50-day average",
  gap200: "Gap to 200-day average",
  volatility: "Volatility, last 4 weeks",
  volume: "Volume vs its average",
} as const;
export type MLFeature = keyof typeof ML_FEATURES;

export const ML_MODELS = {
  logistic: { name: "Logistic regression", about: "A straight-line rule: weighs each feature and adds them up. Simple, fast, hard to overfit." },
  "random-forest": { name: "Random forest", about: "Many small decision trees, each trained on a random slice, voting together." },
  "gradient-boosting": { name: "Gradient boosting", about: "Small trees added one after another, each fixing the last ones' mistakes. Powerful, and easy to overfit." },
} as const;
export type MLModel = keyof typeof ML_MODELS;

export const ML_LIMITS = { maxSymbols: 5, minYears: 3, maxYears: 10, maxCostBps: 100 };

export interface MLSettings {
  version: 1;
  symbols: string[];
  features: MLFeature[];
  model: MLModel;
  start: number;
  end: number;
  trainYears: number;
  testMonths: number;
  costBps: number;
  seed: number;
}

const YEAR = 365.25 * 86_400_000;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

/** Clean settings if `value` is valid (symbols checked with `isKnown`), otherwise null. */
export function parseMLSettings(value: unknown, isKnown: (symbol: string) => boolean): MLSettings | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  const symbols = Array.isArray(v.symbols) ? [...new Set(v.symbols)] : [];
  const features = Array.isArray(v.features) ? [...new Set(v.features)] : [];
  if (symbols.length < 1 || symbols.length > ML_LIMITS.maxSymbols || !symbols.every((s) => typeof s === "string" && isKnown(s))) return null;
  if (features.length < 1 || !features.every((f) => typeof f === "string" && f in ML_FEATURES)) return null;
  if (typeof v.model !== "string" || !(v.model in ML_MODELS) || !isNum(v.start) || !isNum(v.end)) return null;
  const years = (v.end - v.start) / YEAR;
  if (years < ML_LIMITS.minYears - 0.01 || years > ML_LIMITS.maxYears + 0.01) return null;
  const trainYears = v.trainYears ?? 2;
  const testMonths = v.testMonths ?? 3;
  const costBps = v.costBps ?? 10;
  const seed = v.seed ?? 7;
  if (!isInt(trainYears, 1, 3) || !isInt(testMonths, 1, 6) || !isNum(costBps) || costBps < 0 || costBps > ML_LIMITS.maxCostBps || !isInt(seed, 0, 1_000_000)) return null;
  if (years < trainYears + 0.5) return null;
  return { version: 1, symbols: symbols as string[], features: features as MLFeature[], model: v.model as MLModel, start: v.start, end: v.end, trainYears, testMonths, costBps, seed };
}

export interface MLMetrics {
  totalReturn: number;
  cagr: number;
  volatility: number;
  sharpe: number | null;
  maxDrawdown: number;
}

export interface MLResult {
  version: string;
  model: MLModel;
  features: MLFeature[];
  folds: number;
  testStart: number;
  testEnd: number;
  accuracy: { accuracy: number; low: number; high: number; samples: number; upShare: number; majority: number };
  luck: { accuracies: number[]; sharpes: (number | null)[]; excessSharpes: (number | null)[]; totalReturns: number[] };
  strategy: MLMetrics & { turnover: number; exposure: number; excessSharpe: number | null };
  buyAndHold: MLMetrics;
  check: SelectionCheck | null;
  curve: { times: number[]; strategy: number[]; buyAndHold: number[]; luck: number[] };
  importance: Partial<Record<MLFeature, number>>;
  provenance: { dataset: { source: string; simulated: boolean; asOf: number; checksum: string; datasetVersion: string }; method: { version: string; scikitLearn: string } };
}

const metricsOk = (m: unknown) => {
  const v = m as Record<string, unknown> | null;
  return !!v && [v.totalReturn, v.cagr, v.volatility, v.maxDrawdown].every(isNum) && (v.sharpe === null || isNum(v.sharpe));
};

export function parseMLResult(value: unknown): MLResult | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.version !== "string" || typeof v.model !== "string" || !(v.model in ML_MODELS) || !Number.isInteger(v.folds)) return null;
  const a = v.accuracy as Record<string, unknown> | undefined;
  if (!a || ![a.accuracy, a.low, a.high, a.samples, a.upShare, a.majority].every(isNum)) return null;
  if (!metricsOk(v.strategy) || !metricsOk(v.buyAndHold)) return null;
  const c = v.curve as Record<string, unknown> | undefined;
  const n = Array.isArray(c?.times) ? (c.times as unknown[]).length : -1;
  if (!c || n < 2 || !["times", "strategy", "buyAndHold", "luck"].every((k) => Array.isArray(c[k]) && (c[k] as unknown[]).length === n && (c[k] as unknown[]).every(isNum))) return null;
  const p = v.provenance as Record<string, Record<string, unknown>> | undefined;
  if (!p?.dataset || typeof p.dataset.datasetVersion !== "string" || !p.method) return null;
  return value as MLResult;
}

export interface MLSummary {
  model: MLModel;
  accuracy: number;
  majority: number;
  totalReturn: number;
  buyAndHoldReturn: number;
}

export interface SavedMLRun {
  id: string;
  name: string;
  createdAt: number;
  config: MLSettings;
  summary: MLSummary;
  stored?: StoredInfo;
}

export function parseSavedMLRun(value: unknown, isSymbol: (symbol: string) => boolean): SavedMLRun | null {
  const v = value as Record<string, unknown> | null;
  if (!v) return null;
  const config = parseMLSettings(v.config, isSymbol);
  const s = (v.summary ?? {}) as Record<string, unknown>;
  if (!config || typeof v.id !== "string" || typeof v.name !== "string" || v.name.length > MAX_RUN_NAME || !isNum(v.createdAt)) return null;
  if (typeof s.model !== "string" || !(s.model in ML_MODELS) || ![s.accuracy, s.majority, s.totalReturn, s.buyAndHoldReturn].every(isNum)) return null;
  return { id: v.id, name: v.name, createdAt: v.createdAt, config, summary: { model: s.model as MLModel, accuracy: s.accuracy as number, majority: s.majority as number, totalReturn: s.totalReturn as number, buyAndHoldReturn: s.buyAndHoldReturn as number } };
}
