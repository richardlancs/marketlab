/**
 * The machine-learning sandbox's server side: runs, saves and reproduces
 * through the analytics service (services/analytics/analytics/ml.py), on the
 * stored prices (synced first). Server-only.
 */
import "server-only";
import { syncPrices } from "../analytics/server";
import { post, PythonEngineError } from "../backtest/python-client";
import type { Comparison } from "../backtest/stored";
import { priceSource } from "../market";
import { parseMLResult, type MLResult, type MLSettings, type MLSummary } from "./types";

/** Training several models is slower than a backtest: allow it time. */
const TIMEOUT_MS = 45_000;

export type MLRunResult = { ok: true; result: MLResult } | { ok: false; message: string };

const failed = (error: unknown): { ok: false; message: string } => ({ ok: false, message: error instanceof PythonEngineError ? error.message : "The sandbox couldn't run that. Try again in a minute." });
const unreadable = { ok: false as const, message: "The sandbox's answer came back in a form MarketLab couldn't read." };

export async function runML(settings: MLSettings): Promise<MLRunResult> {
  try {
    const synced = await syncPrices(settings.symbols);
    if (synced.failed.length) return { ok: false, message: `Prices for ${synced.failed.join(", ")} are unavailable right now. Try again in a minute.` };
    const data = await post("/v1/ml/run", { source: priceSource(), settings }, "Machine learning", TIMEOUT_MS);
    const result = parseMLResult(data.result);
    return result ? { ok: true, result } : unreadable;
  } catch (error) {
    return failed(error);
  }
}

export async function saveML(ownerId: string, run: { id: string; name: string; createdAt: number }, settings: MLSettings): Promise<{ ok: true; summary: MLSummary; result: MLResult } | { ok: false; message: string }> {
  try {
    await syncPrices(settings.symbols);
    const data = await post("/v1/ml/saved", { ownerId, run, source: priceSource(), settings }, "Save machine learning", TIMEOUT_MS);
    const result = parseMLResult(data.result);
    return result ? { ok: true, summary: data.summary as MLSummary, result } : unreadable;
  } catch (error) {
    return failed(error);
  }
}

export async function reproduceML(runId: string, ownerId: string): Promise<{ ok: true; reproduced: MLResult; comparison: Comparison } | { ok: false; message: string }> {
  try {
    const data = await post(`/v1/ml/saved/${encodeURIComponent(runId)}/reproduce`, { ownerId }, "Reproduce machine learning", TIMEOUT_MS);
    const reproduced = parseMLResult(data.reproduced);
    const c = data.comparison as Comparison | undefined;
    if (!reproduced || typeof c?.matches !== "boolean" || !Array.isArray(c.differences)) return unreadable;
    return { ok: true, reproduced, comparison: c };
  } catch (error) {
    return failed(error);
  }
}
