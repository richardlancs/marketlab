/**
 * The options lab's data, as the analytics service calculates it
 * (services/analytics/analytics/options.py). The chain is simulated: there's
 * no real options data on MarketLab. Types and parsers only.
 */

export type OptionKind = "call" | "put";

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  /** Per calendar day. */
  theta: number;
  /** Per 1 percentage point of volatility. */
  vega: number;
  /** Per 1 percentage point of interest rates. */
  rho: number;
}

export interface ChainExpiry {
  /** YYYY-MM-DD, a third Friday. */
  expiry: string;
  days: number;
  strikes: { strike: number; call: Greeks; put: Greeks }[];
}

export interface OptionChain {
  spot: number;
  volatility: number;
  rate: number;
  dividendYield: number;
  asOf: number;
  expiries: ChainExpiry[];
}

export interface Leg {
  kind: OptionKind | "stock";
  side: "long" | "short";
  /** In shares: one listed contract is 100. */
  quantity: number;
  strike?: number;
  premium?: number;
  price?: number;
}

export interface Payoff {
  prices: number[];
  profit: number[];
  breakevens: number[];
  /** Null when unlimited. */
  maxProfit: number | null;
  maxLoss: number | null;
  /** Positive when the strategy collects more premium than it pays. */
  netPremium: number;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const GREEKS = ["price", "delta", "gamma", "theta", "vega", "rho"] as const;
export const isGreeks = (v: unknown): v is Greeks => !!v && GREEKS.every((k) => isNum((v as Record<string, unknown>)[k]));

export function parseChain(value: unknown): OptionChain | null {
  const v = value as Record<string, unknown> | null;
  if (!v || ![v.spot, v.volatility, v.rate, v.dividendYield, v.asOf].every(isNum) || !Array.isArray(v.expiries)) return null;
  const ok = (v.expiries as Record<string, unknown>[]).every(
    (e) => typeof e?.expiry === "string" && isNum(e.days) && Array.isArray(e.strikes) && (e.strikes as Record<string, unknown>[]).every((r) => isNum(r?.strike) && isGreeks(r.call) && isGreeks(r.put)),
  );
  return ok ? (value as OptionChain) : null;
}

export function parsePayoff(value: unknown): Payoff | null {
  const v = value as Record<string, unknown> | null;
  if (!v || !Array.isArray(v.prices) || !Array.isArray(v.profit) || v.prices.length !== v.profit.length || !Array.isArray(v.breakevens) || !isNum(v.netPremium)) return null;
  if (![...(v.prices as unknown[]), ...(v.profit as unknown[]), ...(v.breakevens as unknown[])].every(isNum)) return null;
  if (!(v.maxProfit === null || isNum(v.maxProfit)) || !(v.maxLoss === null || isNum(v.maxLoss))) return null;
  return value as Payoff;
}

/** The four strategies the lab can set up from the chain, with a line each on what they're for. */
export const STRATEGIES = {
  "long-call": { name: "Buy a call", about: "Pay a premium for the right to buy at the strike: gains if the stock rises past it, and the most you can lose is the premium." },
  "long-put": { name: "Buy a put", about: "Pay a premium for the right to sell at the strike: gains if the stock falls below it." },
  "covered-call": { name: "Covered call", about: "Own 100 shares and sell a call above the price: collect the premium, but give up gains past the strike." },
  "protective-put": { name: "Protective put", about: "Own 100 shares and buy a put below the price: insurance that limits the loss, for the cost of the premium." },
  "bull-call-spread": { name: "Bull call spread", about: "Buy a call and sell a higher one: a cheaper bet on a rise, with both the gain and the loss capped." },
  straddle: { name: "Straddle", about: "Buy a call and a put at the same strike: gains from a big move either way, loses if the stock sits still." },
} as const;
export type StrategyKey = keyof typeof STRATEGIES;
