/**
 * Prices through the trading day, every 5 minutes from the 9:30 AM open to
 * the 4 PM close (New York time), for the mock market's most recent days.
 * They let the 1D, 1W and 1M charts show how the price moved within each day
 * instead of jumping from one close to the next.
 *
 * Each day's path is built from that day's bar: it starts at the open, ends
 * exactly at the close, and reaches exactly the day's high and low, so the
 * chart always agrees with the day's numbers. Like the rest of the mock
 * market it's seeded, so the same day always has the same path. Real data
 * (Tiingo's end-of-day prices) has no intraday prices, and none are made up
 * for it: its charts stay daily.
 */
import { bridge, hashString, mulberry32 } from "../random";
import type { DailyBar, PricePoint } from "../types";
import { CLOSE_OFFSET, newYorkClose } from "./calendar";

/** 5-minute steps from 9:30 AM to 4 PM: 78, so 79 prices a day including the open. */
export const SESSION_STEPS = 78;
const STEP = 5 * 60 * 1000;
/** About a month of trading days: enough for the 1M chart. */
export const INTRADAY_SESSIONS = 22;

/** Raises the path around `k` by a tent shape, so its value at `k` becomes `target` without passing it anywhere else. */
function bump(path: number[], k: number, target: number, width = 4) {
  const lift = target - path[k];
  for (let j = Math.max(1, k - width); j <= Math.min(path.length - 2, k + width); j++) path[j] += lift * (1 - Math.abs(j - k) / (width + 1));
}

/**
 * One day's prices, open to close, as traded (not adjusted). Interior points
 * only: the first is the open and the last the close.
 */
export function sessionPath(seed: string, bar: Pick<DailyBar, "open" | "high" | "low" | "close">): number[] {
  const { open, high, low, close } = bar;
  const rng = mulberry32(hashString(seed));
  // A typical step for a day whose range is (high − low).
  const volatility = Math.max(1e-6, (high - low) / Math.max(open, 1e-9) / (2 * Math.sqrt(SESSION_STEPS)));
  const path = bridge(rng, open, close, SESSION_STEPS, volatility);

  const top = Math.max(open, close);
  const bottom = Math.min(open, close);
  const interior = path.slice(1, -1);
  // Make sure the path gets above the open and close if the high is above them (and below for the low)...
  if (high > top && Math.max(...interior) <= top) {
    const k = 1 + interior.indexOf(Math.max(...interior));
    bump(path, k, (top + high) / 2);
  }
  if (low < bottom && Math.min(...path.slice(1, -1)) >= bottom) {
    const k = 1 + path.slice(1, -1).indexOf(Math.min(...path.slice(1, -1)));
    bump(path, k, (bottom + low) / 2);
  }
  // ...then stretch the parts above and below so they reach exactly the high and the low.
  const max = Math.max(...path);
  const min = Math.min(...path);
  return path.map((v, i) => {
    if (i === 0) return open;
    if (i === SESSION_STEPS) return close;
    if (v > top && max > top) return top + ((v - top) * (high - top)) / (max - top);
    if (v < bottom && min < bottom) return bottom - ((bottom - v) * (bottom - low)) / (bottom - min);
    return v;
  });
}

/**
 * 5-minute prices for the last `sessions` days of `bars`, oldest first,
 * adjusted like the daily history (each day scaled by its adjClose ÷ close),
 * so the day's last price is exactly its adjusted close.
 */
export function intradayPrices(symbol: string, bars: readonly DailyBar[], sessions = INTRADAY_SESSIONS): PricePoint[] {
  const points: PricePoint[] = [];
  for (const bar of bars.slice(-sessions)) {
    const day = bar.time - CLOSE_OFFSET;
    const close = newYorkClose(day);
    const factor = bar.close === 0 ? 1 : bar.adjClose / bar.close;
    sessionPath(`${symbol}:${day}:intraday`, bar).forEach((price, i) => {
      points.push({ time: close - (SESSION_STEPS - i) * STEP, price: Math.round(price * factor * 10_000) / 10_000 });
    });
  }
  return points;
}
