/**
 * The mock market's shared moves, so simulated stocks behave like real ones:
 * they rise and fall together, more so within a sector, and calm and stormy
 * stretches hit everything at once.
 *
 * Each stock's daily (log) return is
 *
 *     beta × market + its sector's factor + its own noise
 *
 * - The market factor follows the S&P 500's real path roughly, through
 *   waypoints at real turning points (the 2022 bear market, the 2023–24
 *   rally, the April 2025 sell-off). Between them, and after ANCHOR_DAY, its
 *   moves are generated. Its volatility clusters (GARCH(1,1)) and its moves
 *   have fat tails (Student's t), as real daily returns do.
 * - Each sector has its own factor, scaled by the market's current volatility,
 *   so sectors drift apart but storms are shared.
 * - Betas are typical for each sector (utilities ≈ 0.5, semiconductors ≈ 1.5),
 *   varied a little per stock, with known high- and low-beta names set by hand.
 *
 * Everything is seeded: the past is generated once from fixed seeds, and each
 * day after ANCHOR_DAY from its own date, so a day never changes once it exists.
 */
import { gaussian, hashString, mulberry32, type Rng } from "../random";
import { catalogEntry } from "./catalog";
import { tradingDaysAfter, tradingDaysEndingAt } from "./calendar";

const SEED = 2026;
const rngFor = (key: string): Rng => mulberry32(hashString(key) ^ SEED);

/** The anchor day and history length, as in ./mock.ts (repeated here to avoid an import cycle). */
const ANCHOR_DAY = Date.UTC(2026, 9, 16);
const HISTORY_BARS = 1310;

/** The market's long-run daily volatility (about 17% a year). */
export const MARKET_VOLATILITY = 0.0108;
/** GARCH(1,1): today's variance = ω + α × yesterday's squared shock + β × yesterday's variance. */
const GARCH = { alpha: 0.09, beta: 0.89 };
const OMEGA = MARKET_VOLATILITY ** 2 * (1 - GARCH.alpha - GARCH.beta);
/** The market's average daily drift after ANCHOR_DAY (about 7.5% a year). */
const MARKET_DRIFT = 0.0003;

/**
 * Approximate S&P 500 closes at real turning points. The generated path passes
 * through each one; everything between them is simulated. The last is the
 * index's real level on ANCHOR_DAY (./anchors.ts).
 */
const SPX_WAYPOINTS: [string, number][] = [
  ["2021-10-18", 4486],
  ["2022-01-03", 4797],
  ["2022-06-16", 3667],
  ["2022-08-16", 4305],
  ["2022-10-12", 3577],
  ["2023-02-02", 4180],
  ["2023-03-13", 3855],
  ["2023-07-31", 4589],
  ["2023-10-27", 4117],
  ["2024-03-28", 5254],
  ["2024-04-19", 4967],
  ["2024-07-16", 5667],
  ["2024-08-05", 5186],
  ["2024-12-06", 6090],
  ["2025-02-19", 6144],
  ["2025-04-08", 4982],
  ["2025-06-30", 6205],
  ["2025-10-08", 6753],
  ["2026-10-16", 7811],
];

/** Typical beta and the daily volatility of each sector's own factor. */
export const SECTORS: Record<string, { beta: number; volatility: number }> = {
  Technology: { beta: 1.15, volatility: 0.006 },
  Semiconductors: { beta: 1.5, volatility: 0.014 },
  "Communication Services": { beta: 1.05, volatility: 0.006 },
  "Consumer Discretionary": { beta: 1.15, volatility: 0.006 },
  "Consumer Staples": { beta: 0.6, volatility: 0.005 },
  Financials: { beta: 1.05, volatility: 0.007 },
  "Health Care": { beta: 0.75, volatility: 0.006 },
  Industrials: { beta: 1.0, volatility: 0.005 },
  Energy: { beta: 0.9, volatility: 0.013 },
  Materials: { beta: 1.0, volatility: 0.007 },
  "Real Estate": { beta: 0.9, volatility: 0.007 },
  Utilities: { beta: 0.5, volatility: 0.006 },
};
const SECTOR_NAMES = Object.keys(SECTORS);

/** Well-known betas, roughly as published (5-year monthly). */
const KNOWN_BETAS: Record<string, number> = {
  TSLA: 2.0, NVDA: 1.8, AMD: 1.8, PLTR: 2.0, SHOP: 2.0, UBER: 1.4, NFLX: 1.3, META: 1.25, AMZN: 1.2, AAPL: 1.2,
  MSFT: 1.1, GOOGL: 1.05, JPM: 1.1, V: 0.95, MA: 1.05, KO: 0.55, PEP: 0.55, PG: 0.45, WMT: 0.5, COST: 0.8,
  JNJ: 0.55, MRK: 0.4, LLY: 0.45, UNH: 0.6, MCD: 0.65, DUK: 0.45, NEE: 0.6, T: 0.6, VZ: 0.4, NEM: 0.5,
};

export interface FactorProfile {
  sector: string;
  beta: number;
}

/** The sector and beta a symbol's mock prices are generated with. */
export function factorProfile(symbol: string): FactorProfile {
  const listed = catalogEntry(symbol)?.sector;
  const sector = listed && SECTORS[listed] ? listed : SECTOR_NAMES[hashString(symbol) % SECTOR_NAMES.length];
  const jitter = (rngFor(`${symbol}:beta`)() - 0.5) * 0.3; // ±0.15
  return { sector, beta: KNOWN_BETAS[symbol] ?? Math.round((SECTORS[sector].beta + jitter) * 100) / 100 };
}

/** Student's t with 5 degrees of freedom, scaled to variance 1: bell-shaped, but with fatter tails. */
function fatTailed(rng: Rng): number {
  let chiSquare = 0;
  for (let i = 0; i < 5; i++) chiSquare += gaussian(rng) ** 2;
  return (gaussian(rng) / Math.sqrt(chiSquare / 5)) * Math.sqrt(3 / 5);
}

export interface Factor {
  /** Trading days (00:00 UTC), oldest first: the past HISTORY_BARS through ANCHOR_DAY, then any after. */
  days: number[];
  /** Log return on each day (0 on the first). */
  returns: number[];
}

export interface MarketFactor extends Factor {
  /** The S&P 500's level each day (log). */
  levels: number[];
  /** Each day's volatility relative to the long-run level (1 = normal, 2 = twice as stormy). */
  stress: number[];
}

const marketCache = new Map<number, MarketFactor>();
const sectorCache = new Map<string, Factor>();
const remember = <T>(cache: Map<string | number, T>, key: string | number, make: () => T): T => {
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 64) cache.clear();
  const value = make();
  cache.set(key, value);
  return value;
};

/** The market factor through `lastDay` (a trading day at or after ANCHOR_DAY). */
export function marketFactor(lastDay: number): MarketFactor {
  return remember(marketCache as Map<string | number, MarketFactor>, lastDay, () => {
    const past = tradingDaysEndingAt(ANCHOR_DAY, HISTORY_BARS);
    const future = tradingDaysAfter(ANCHOR_DAY, lastDay);

    // Generated shocks with clustered volatility, then bent through the waypoints.
    const rng = rngFor("market");
    let variance = MARKET_VOLATILITY ** 2;
    const noise = [0];
    const stress = [1];
    for (let i = 1; i < past.length; i++) {
      const shock = Math.sqrt(variance) * fatTailed(rng);
      noise.push(noise[i - 1] + shock);
      stress.push(Math.sqrt(variance) / MARKET_VOLATILITY);
      variance = OMEGA + GARCH.alpha * shock ** 2 + GARCH.beta * variance;
    }
    const points = SPX_WAYPOINTS.map(([date, level]) => {
      const day = Date.parse(`${date}T00:00:00Z`);
      const index = past.findIndex((d) => d >= day);
      return { index: index === -1 ? past.length - 1 : index, log: Math.log(level) };
    });
    points[0].index = 0;
    points[points.length - 1].index = past.length - 1;
    const levels = new Array<number>(past.length);
    for (let k = 0; k + 1 < points.length; k++) {
      const a = points[k];
      const b = points[k + 1];
      const tilt = noise[b.index] - noise[a.index] - (b.log - a.log);
      for (let i = a.index; i <= b.index; i++) levels[i] = a.log + noise[i] - noise[a.index] - ((i - a.index) / (b.index - a.index)) * tilt;
    }

    // After the anchor: one seeded shock per day, continuing the volatility.
    for (const day of future) {
      const shock = Math.sqrt(variance) * fatTailed(rngFor(`market:${day}`));
      stress.push(Math.sqrt(variance) / MARKET_VOLATILITY);
      levels.push(levels[levels.length - 1] + MARKET_DRIFT + shock);
      variance = OMEGA + GARCH.alpha * shock ** 2 + GARCH.beta * variance;
    }
    const returns = levels.map((level, i) => (i === 0 ? 0 : level - levels[i - 1]));
    return { days: [...past, ...future], returns, levels, stress };
  });
}

/** A sector's own factor: independent moves, as stormy as the market is that day. */
export function sectorFactor(sector: string, lastDay: number): Factor {
  return remember(sectorCache as Map<string | number, Factor>, `${sector}:${lastDay}`, () => {
    const market = marketFactor(lastDay);
    const volatility = SECTORS[sector]?.volatility ?? 0.006;
    const rng = rngFor(`sector:${sector}`);
    const pastCount = market.days.length - tradingDaysAfter(ANCHOR_DAY, lastDay).length;
    const returns = market.days.map((day, i) => {
      if (i === 0) return 0;
      const draw = i < pastCount ? gaussian(rng) : gaussian(rngFor(`sector:${sector}:${day}`));
      return volatility * market.stress[i] * draw;
    });
    return { days: market.days, returns };
  });
}

/**
 * A stock's daily log returns through `lastDay`, before any drift: beta times
 * the market, plus its sector, plus its own noise. Its own noise makes up the
 * rest of `dailyVolatility` (and never less than a third of it).
 */
export function stockReturns(symbol: string, dailyVolatility: number, lastDay: number): Factor {
  const { sector, beta } = factorProfile(symbol);
  const market = marketFactor(lastDay);
  const own = sectorFactor(sector, lastDay);
  const shared = beta ** 2 * MARKET_VOLATILITY ** 2 + (SECTORS[sector]?.volatility ?? 0.006) ** 2;
  const idiosyncratic = Math.sqrt(Math.max(dailyVolatility ** 2 - shared, (dailyVolatility / 3) ** 2));
  const rng = rngFor(`${symbol}:path`);
  const pastCount = market.days.length - tradingDaysAfter(ANCHOR_DAY, lastDay).length;
  const returns = market.days.map((day, i) => {
    if (i === 0) return 0;
    const draw = i < pastCount ? fatTailed(rng) : fatTailed(rngFor(`${symbol}:${day}`));
    // Calm and stormy stretches reach a stock's own moves too, but only half as strongly.
    return beta * market.returns[i] + own.returns[i] + idiosyncratic * (0.5 + 0.5 * market.stress[i]) * draw;
  });
  return { days: market.days, returns };
}

/**
 * The indices, built from the same factors: the S&P 500 is the market
 * factor itself; the Nasdaq leans on technology, semiconductors and
 * communication; the Dow on industrials and financials. Each also gets a
 * little noise of its own. Their levels five years before ANCHOR_DAY are the
 * real ones, roughly.
 */
const INDEX_MIX: Record<string, { start: number; market: number; sectors: Record<string, number> }> = {
  IXIC: { start: 15021, market: 1.2, sectors: { Technology: 0.35, Semiconductors: 0.25, "Communication Services": 0.15 } },
  DJI: { start: 35258, market: 0.92, sectors: { Industrials: 0.25, Financials: 0.2 } },
};

/** An index's daily log returns through `lastDay`, and the level it starts from. SPX is the market factor. */
export function indexReturns(symbol: string, lastDay: number): (Factor & { start: number }) | null {
  const market = marketFactor(lastDay);
  if (symbol === "SPX") return { days: market.days, returns: market.returns, start: Math.exp(market.levels[0]) };
  const mix = INDEX_MIX[symbol];
  if (!mix) return null;
  const sectors = Object.entries(mix.sectors).map(([name, weight]) => ({ weight, factor: sectorFactor(name, lastDay) }));
  const rng = rngFor(`${symbol}:path`);
  const pastCount = market.days.length - tradingDaysAfter(ANCHOR_DAY, lastDay).length;
  const returns = market.days.map((day, i) => {
    if (i === 0) return 0;
    const draw = i < pastCount ? gaussian(rng) : gaussian(rngFor(`${symbol}:${day}`));
    return sectors.reduce((sum, s) => sum + s.weight * s.factor.returns[i], mix.market * market.returns[i]) + 0.002 * draw;
  });
  return { days: market.days, returns, start: mix.start };
}
