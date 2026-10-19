/**
 * Runs a parameter sweep off the main thread, so the page keeps scrolling and
 * responding while up to 200 backtests run. Plain TypeScript with no React or
 * Next.js imports: a worker has no DOM, only messages.
 *
 * In:  { base, axes, history, market }
 * Out: { type: "progress", done, total } every few runs, then
 *      { type: "done", result } (or { type: "done", result: { error } }).
 */
import type { PricePoint } from "../types";
import type { BacktestConfig } from "./config";
import { runSweep, type Axis } from "./sweep";

interface Job {
  base: BacktestConfig;
  axes: Axis[];
  history: Record<string, PricePoint[]>;
  market: PricePoint[];
}

self.onmessage = (event: MessageEvent<Job>) => {
  const { base, axes, history, market } = event.data;
  const result = runSweep(base, axes, history, market, (done, total) => self.postMessage({ type: "progress", done, total }));
  self.postMessage({ type: "done", result });
};
