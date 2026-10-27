/**
 * A review of the visitor's own paper trading (the portfolio's Review tab),
 * as the analytics service calculates it (services/analytics/analytics/
 * review.py).
 * Types and parsers only, so the route, the browser and tests can use them.
 *
 * Returns are fractions (0.021 = 2.1%), gains dollars, times ms.
 */
import { isTradeReason, type TradeReason } from "../trading";


export interface RoundTrip {
  symbol: string;
  /** null: shares held from the start (a starting portfolio, or trades older than the account keeps). */
  entry: number | null;
  exit: number;
  shares: number;
  entryPrice: number;
  exitPrice: number;
  gain: number;
  return: number;
  /** Sessions held; null when the entry isn't known. */
  days: number | null;
  reason: TradeReason | null;
  exitReason: TradeReason | null;
}

export interface OpenLot {
  symbol: string;
  entry: number | null;
  shares: number;
  entryPrice: number;
  price: number;
  gain: number;
  return: number;
  days: number | null;
  reason: TradeReason | null;
}

export interface AfterSale {
  symbol: string;
  time: number;
  price: number;
  after5: number | null;
  after21: number | null;
  after63: number | null;
  market5: number | null;
  market21: number | null;
  market63: number | null;
}

export interface TradeReview {
  status: "ok";
  asOf: number;
  method: "fifo";
  summary: {
    roundTrips: number;
    wins: number;
    losses: number;
    hitRate: number | null;
    averageWin: number | null;
    averageLoss: number | null;
    averageWinReturn: number | null;
    averageLossReturn: number | null;
    profitFactor: number | null;
    /** FIFO gains on everything sold. */
    realised: number | null;
    /** The same sales' gains as the account records them (against the average cost). */
    averageCostRealised: number | null;
    medianDays: number | null;
    best: RoundTrip | null;
    worst: RoundTrip | null;
  };
  roundTrips: RoundTrip[];
  open: OpenLot[];
  byReason: { reason: TradeReason | "none"; roundTrips: number; hitRate: number | null; averageReturn: number | null; gain: number | null }[];
  afterSales: {
    sales: AfterSale[];
    summary: Record<"5" | "21" | "63", { sales: number; average: number | null; rose: number | null; averageVsMarket: number | null }>;
  };
  disposition: {
    realisedGains: number;
    realisedLosses: number;
    paperGains: number;
    paperLosses: number;
    sellDays: number;
    minimumDays: number;
    enough: boolean;
    pgr: number | null;
    plr: number | null;
    difference: number | null;
  };
  /** From a week after the first trade: the account, its first week's holdings kept, and the S&P 500 scaled to the same start. */
  compared: {
    start: number;
    times: number[];
    actual: (number | null)[];
    kept: (number | null)[];
    benchmark: (number | null)[];
    returns: { actual: number | null; kept: number | null; benchmark: number | null };
  } | null;
}

export type ReviewResult = TradeReview | { status: "no-trades" };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const reasonOrNull = (v: unknown) => v === null || v === undefined || isTradeReason(v);
const nums = (v: unknown) => Array.isArray(v) && v.every(numOrNull);

function trip(v: unknown, open = false): boolean {
  const t = obj(v);
  if (!t || typeof t.symbol !== "string" || !numOrNull(t.entry) || !numOrNull(t.days) || !reasonOrNull(t.reason)) return false;
  const fields = open ? ["shares", "entryPrice", "price", "gain", "return"] : ["exit", "shares", "entryPrice", "exitPrice", "gain", "return"];
  return fields.every((k) => isNum(t[k])) && (open || reasonOrNull(t.exitReason));
}

/** The review if `value` has its shape, or null. */
export function parseReview(value: unknown): ReviewResult | null {
  const v = obj(value);
  if (v?.status === "no-trades") return { status: "no-trades" };
  if (!v || v.status !== "ok" || !isNum(v.asOf)) return null;
  const s = obj(v.summary);
  if (!s || !["roundTrips", "wins", "losses"].every((k) => isNum(s[k]))) return null;
  if (!["hitRate", "averageWin", "averageLoss", "averageWinReturn", "averageLossReturn", "profitFactor", "realised", "averageCostRealised", "medianDays"].every((k) => numOrNull(s[k]))) return null;
  if ((s.best !== null && !trip(s.best)) || (s.worst !== null && !trip(s.worst))) return null;
  if (!Array.isArray(v.roundTrips) || !v.roundTrips.every((t) => trip(t)) || !Array.isArray(v.open) || !v.open.every((t) => trip(t, true))) return null;
  if (!Array.isArray(v.byReason) || !v.byReason.every((g) => obj(g) && (isTradeReason((g as Record<string, unknown>).reason) || (g as Record<string, unknown>).reason === "none") && isNum((g as Record<string, unknown>).roundTrips))) return null;
  const after = obj(v.afterSales);
  const afterSummary = obj(after?.summary);
  if (!after || !afterSummary || !Array.isArray(after.sales) || !["5", "21", "63"].every((k) => obj(afterSummary[k]) && isNum(obj(afterSummary[k])!.sales))) return null;
  if (!after.sales.every((x) => obj(x) && typeof (x as Record<string, unknown>).symbol === "string" && ["after5", "after21", "after63", "market5", "market21", "market63"].every((k) => numOrNull((x as Record<string, unknown>)[k])))) return null;
  const d = obj(v.disposition);
  if (!d || typeof d.enough !== "boolean" || !["realisedGains", "realisedLosses", "paperGains", "paperLosses", "sellDays", "minimumDays"].every((k) => isNum(d[k])) || !["pgr", "plr", "difference"].every((k) => numOrNull(d[k]))) return null;
  if (v.compared !== null) {
    const c = obj(v.compared);
    const r = obj(c?.returns);
    if (!c || !r || !isNum(c.start) || !Array.isArray(c.times) || !c.times.every(isNum)) return null;
    const n = c.times.length;
    if (!["actual", "kept", "benchmark"].every((k) => nums(c[k]) && (c[k] as unknown[]).length === n) || !["actual", "kept", "benchmark"].every((k) => numOrNull(r[k]))) return null;
  }
  return value as TradeReview;
}


const percent = (share: number) => `${Math.round(share * 100)}%`;

/** The disposition measure in plain words, or null when there aren't enough selling days. */
export function dispositionVerdict(d: TradeReview["disposition"]): string | null {
  if (!d.enough || d.difference === null || d.pgr === null || d.plr === null) return null;
  const gap = Math.round(d.difference * 100);
  const head = `On the days you sold, you took ${percent(d.pgr)} of the gains you could have, and ${percent(d.plr)} of the losses.`;
  if (gap >= 5) return `${head} You sell winners more readily than losers: the disposition effect.`;
  if (gap <= -5) return `${head} You cut losers more readily than you take gains: the opposite of the usual habit.`;
  return `${head} You treat gains and losses about the same.`;
}
