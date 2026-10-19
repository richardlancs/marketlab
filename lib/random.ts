/**
 * Deterministic ("seeded") randomness.
 *
 * Math.random() gives different numbers on every run, which would make the
 * server and the browser disagree, and Next.js Cache Components rejects it
 * during prerendering. A seeded generator always produces the same sequence
 * for the same seed, so the mock data is random-looking but reproducible.
 */

/** A function returning the next pseudo-random number in [0, 1). */
export type Rng = () => number;

/**
 * Mulberry32: a tiny, fast 32-bit PRNG. Not suitable for cryptography, but
 * plenty for mock data. Each call advances the internal state.
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash: turns a string (like a ticker symbol) into a 32-bit seed. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A standard normal sample (mean 0, std dev 1) via the Box–Muller transform.
 * Price moves are roughly bell-shaped, so this looks more realistic than
 * uniform noise.
 */
export function gaussian(rng: Rng): number {
  const u1 = 1 - rng(); // in (0, 1], so Math.log never sees 0
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * A random path of `steps` moves that starts exactly at `start` and ends
 * exactly at `end` (a "Brownian bridge"). Returns `steps + 1` values.
 *
 * How: take a random walk in log space (so moves are percentages, and prices
 * can't go negative), then tilt it linearly so both endpoints land on target.
 * `volatility` is the standard deviation of each step's percentage move.
 */
export function bridge(rng: Rng, start: number, end: number, steps: number, volatility: number): number[] {
  const walk = [0];
  for (let i = 1; i <= steps; i++) {
    walk.push(walk[i - 1] + volatility * gaussian(rng));
  }

  const logStart = Math.log(start);
  const logEnd = Math.log(end);
  const drift = walk[steps];

  return walk.map((w, i) => {
    if (i === 0) return start;
    if (i === steps) return end; // avoid floating-point drift on the endpoint
    const progress = i / steps;
    return Math.exp(logStart + w - progress * drift + progress * (logEnd - logStart));
  });
}
