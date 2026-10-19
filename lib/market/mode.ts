/**
 * Which data source is in use: "tiingo" (real prices) or "mock". No imports,
 * so proxy.ts can read it as cheaply as lib/market/index.ts does.
 *
 * Tiingo's free plan is for personal use only. So on Vercel (VERCEL_ENV is set
 * on every Vercel deployment) a TIINGO_API_KEY is ignored unless
 * MARKET_DATA_PRIVATE=1 says the deployment is private. That way a key added
 * by mistake can't put real prices on the public site.
 */
export type MarketMode = "mock" | "tiingo";

export function marketMode(env: Record<string, string | undefined> = process.env): MarketMode {
  if (!env.TIINGO_API_KEY || env.MARKET_DATA_SOURCE === "mock") return "mock";
  if (env.VERCEL_ENV && env.MARKET_DATA_PRIVATE !== "1") return "mock";
  return "tiingo";
}

/** True when a key is set but ignored by the public-deployment guard above, so it can be logged. */
export const isTiingoBlocked = (env: Record<string, string | undefined> = process.env) =>
  Boolean(env.TIINGO_API_KEY && env.MARKET_DATA_SOURCE !== "mock" && env.VERCEL_ENV && env.MARKET_DATA_PRIVATE !== "1");
