/**
 * A dataset snapshot: the exact prices a backtest was calculated from, with
 * where they came from. Stored with a saved run (lib/db/backtests.ts) so the
 * result can be reproduced later from the same inputs, whatever the market
 * data has become since.
 *
 * It holds only the days the run can use (its start to end dates), each
 * holding's adjusted closes, and the market index when that's the benchmark.
 * Its SHA-256 checksum, over a canonical encoding of the data, identifies it:
 * the same inputs always give the same checksum, so identical snapshots are
 * stored once, and any change to a single price gives a different one.
 *
 * Pure apart from Node's hashing, so the database layer and tests can use it
 * too; only server code imports it.
 */
import { createHash } from "node:crypto";
import type { PricePoint } from "../types";
import type { BacktestConfig } from "./config";
import type { ExtraPoint } from "./engine";
import type { DatasetInfo } from "./stored";

/** Daily closes as parallel lists, oldest first: compact, and what the Python service takes. */
export interface SeriesData {
  times: number[];
  prices: number[];
  /**
   * Only when a rule needs them (lib/backtest/rules.ts needsBars): each day's
   * high and low on the same adjusted scale as `prices`, and its volume. Left
   * out otherwise, so every other snapshot (and its checksum) is unchanged.
   */
  high?: number[];
  low?: number[];
  volume?: (number | null)[];
}

export interface PriceSnapshot {
  /** The snapshot format. */
  version: 1;
  /** Where the prices came from: MarketLab's simulated market, or Tiingo's real end-of-day prices. */
  source: "mock" | "tiingo";
  simulated: boolean;
  /** The latest close in the market data when the snapshot was taken. */
  asOf: number;
  /** How the prices are adjusted (see ASSUMPTIONS). */
  adjustment: "split-and-dividend-adjusted-closes";
  /** Each holding's adjusted closes, in the run's date window. */
  series: Record<string, SeriesData>;
  /** The market index, when the benchmark is the market. */
  market: { symbol: string; name: string; data: SeriesData } | null;
}

/** What identifies a snapshot, shown and stored with results (see DatasetInfo). */
export type SnapshotInfo = DatasetInfo;

const inWindow = (points: PricePoint[], start: number, end: number, extra?: ExtraPoint[]): SeriesData => {
  const kept = points.filter((p) => p.time >= start && p.time <= end);
  const data: SeriesData = { times: kept.map((p) => p.time), prices: kept.map((p) => p.price) };
  if (!extra) return data;
  const byTime = new Map(extra.map((e) => [e.time, e]));
  return {
    ...data,
    high: kept.map((p) => byTime.get(p.time)?.high ?? p.price),
    low: kept.map((p) => byTime.get(p.time)?.low ?? p.price),
    volume: kept.map((p) => byTime.get(p.time)?.volume ?? null),
  };
};

/** A snapshot series' highs, lows and volumes as the engine takes them, if it has them. */
export function extrasOf(data: SeriesData): ExtraPoint[] | undefined {
  if (!data.high || !data.low || !data.volume) return undefined;
  return data.times.map((time, i) => ({ time, high: data.high![i], low: data.low![i], volume: data.volume![i] }));
}

export function makeSnapshot(
  config: BacktestConfig,
  history: Record<string, PricePoint[]>,
  market: { symbol: string; name: string; history: PricePoint[] },
  source: PriceSnapshot["source"],
  asOf: number,
  extra?: Record<string, ExtraPoint[]>,
): PriceSnapshot {
  const series = Object.fromEntries(config.holdings.map((h) => [h.symbol, inWindow(history[h.symbol] ?? [], config.start, config.end, extra?.[h.symbol])]));
  return {
    version: 1,
    source,
    simulated: source === "mock",
    asOf,
    adjustment: "split-and-dividend-adjusted-closes",
    series,
    market: config.benchmark === "market" ? { symbol: market.symbol, name: market.name, data: inWindow(market.history, config.start, config.end) } : null,
  };
}

/**
 * JSON with object keys sorted at every level, so the same data always
 * encodes (and hashes) the same way. Numbers use JavaScript's shortest
 * round-trip form, which is stable for the same double.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const checksumOf = (snapshot: PriceSnapshot) => createHash("sha256").update(canonicalJson(snapshot)).digest("hex");

export function describeSnapshot(snapshot: PriceSnapshot): SnapshotInfo {
  const checksum = checksumOf(snapshot);
  const all = [...Object.values(snapshot.series), ...(snapshot.market ? [snapshot.market.data] : [])];
  const times = all.flatMap((s) => (s.times.length ? [s.times[0], s.times[s.times.length - 1]] : []));
  return {
    checksum,
    datasetVersion: `${snapshot.source}:${checksum.slice(0, 12)}`,
    source: snapshot.source,
    simulated: snapshot.simulated,
    asOf: snapshot.asOf,
    firstDate: times.length ? Math.min(...times) : null,
    lastDate: times.length ? Math.max(...times) : null,
    observations: all.reduce((n, s) => n + s.times.length, 0),
  };
}

/** Back to the points the engines take. */
export const toPoints = (data: SeriesData): PricePoint[] => data.times.map((time, i) => ({ time, price: data.prices[i] }));

/** Checks something read back from storage is a well-formed snapshot. */
export function parseSnapshot(value: unknown): PriceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<PriceSnapshot>;
  const isSeries = (s: unknown): s is SeriesData => {
    const d = s as SeriesData | null;
    if (!d || !Array.isArray(d.times) || !Array.isArray(d.prices) || d.times.length !== d.prices.length || !d.prices.every((p) => typeof p === "number" && Number.isFinite(p))) return false;
    // Absent (or null, as any older copy may have it) means the series has no such data.
    const optional = (values: unknown, ok: (v: unknown) => boolean) => values === undefined || values === null || (Array.isArray(values) && values.length === d.times.length && values.every(ok));
    const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
    return optional(d.high, finite) && optional(d.low, finite) && optional(d.volume, (v) => v === null || finite(v));
  };
  if (v.version !== 1 || (v.source !== "mock" && v.source !== "tiingo") || typeof v.asOf !== "number" || !v.series || typeof v.series !== "object") return null;
  if (!Object.values(v.series).every(isSeries)) return null;
  if (v.market !== null && (!v.market || !isSeries(v.market.data))) return null;
  return v as PriceSnapshot;
}
