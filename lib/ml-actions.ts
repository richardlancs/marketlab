"use server";

/**
 * Server Actions for the machine-learning sandbox (lib/ml): run, save, list,
 * open, delete and reproduce. As with saved backtests: whose runs they are
 * comes from the session or guest cookie, every argument is validated, and
 * results are calculated by the analytics service from stored prices, never
 * taken from the browser. Training is heavy, so runs are limited to a few a
 * minute per visitor.
 */
import { MAX_RUN_NAME, MAX_SAVED_RUNS } from "./backtest/config";
import type { Comparison } from "./backtest/stored";
import { backtests } from "./db";
import { catalogEntry } from "./market/catalog";
import { reproduceML, runML, saveML, type MLRunResult } from "./ml/server";
import { parseMLSettings, type MLResult, type SavedMLRun } from "./ml/types";
import { currentOwner } from "./owner";
import { allow } from "./rate-limit";

const INVALID = "Those settings aren't valid.";
const TOO_MANY = "You're training a lot of models. Wait a minute and try again.";
const MISSING = "That saved run doesn't exist.";
const isKnown = (symbol: string) => !!catalogEntry(symbol);

export async function runMLAction(settings: unknown): Promise<MLRunResult> {
  const parsed = parseMLSettings(settings, isKnown);
  if (!parsed) return { ok: false, message: INVALID };
  if (!(await allow("ml", 6, 60))) return { ok: false, message: TOO_MANY };
  return runML(parsed);
}

export type SaveMLResult = { ok: true; run: SavedMLRun; result: MLResult } | { ok: false; message: string };

/** Saves a run: the service trains and tests it again on the stored prices and keeps the exact prices it used, so it can be reproduced. */
export async function saveMLAction(name: unknown, settings: unknown): Promise<SaveMLResult> {
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName || cleanName.length > MAX_RUN_NAME) return { ok: false, message: `Give the run a name of up to ${MAX_RUN_NAME} characters.` };
  const parsed = parseMLSettings(settings, isKnown);
  if (!parsed) return { ok: false, message: INVALID };
  if (!(await allow("ml", 6, 60))) return { ok: false, message: TOO_MANY };
  const owner = await currentOwner({ create: true });
  if (!owner) return { ok: false, message: "Couldn't save the run. Reload the page and try again." };
  const run = { id: crypto.randomUUID(), name: cleanName, createdAt: Date.now() };
  const saved = await saveML(owner.id, run, parsed);
  if (!saved.ok) return saved;
  const d = saved.result.provenance.dataset;
  return { ok: true, run: { ...run, config: parsed, summary: saved.summary, stored: { engine: { name: "python-ml", version: saved.result.version }, dataSource: d.source, simulated: d.simulated, datasetVersion: d.datasetVersion } }, result: saved.result };
}

export async function listMLRunsAction(): Promise<{ runs: SavedMLRun[]; limit: number }> {
  const owner = await currentOwner({ create: false });
  return { runs: owner ? await backtests.listML(owner.id) : [], limit: MAX_SAVED_RUNS };
}

export async function loadMLRunAction(id: unknown): Promise<{ ok: true; run: SavedMLRun; result: MLResult } | { ok: false; message: string }> {
  if (typeof id !== "string" || id.length > 64) return { ok: false, message: MISSING };
  const owner = await currentOwner({ create: false });
  const found = owner ? await backtests.getML(owner.id, id) : null;
  if (!found) return { ok: false, message: MISSING };
  if (!found.result) return { ok: false, message: "This run's stored result couldn't be read." };
  return { ok: true, run: found.run, result: found.result };
}

export async function deleteMLRunAction(id: unknown): Promise<{ ok: boolean }> {
  if (typeof id !== "string" || id.length > 64) return { ok: false };
  const owner = await currentOwner({ create: false });
  if (!owner || !(await backtests.getML(owner.id, id))) return { ok: false };
  await backtests.remove(owner.id, id);
  return { ok: true };
}

export async function reproduceMLRunAction(id: unknown): Promise<{ ok: true; reproduced: MLResult; comparison: Comparison } | { ok: false; message: string }> {
  if (typeof id !== "string" || id.length > 64) return { ok: false, message: MISSING };
  const owner = await currentOwner({ create: false });
  if (!owner || !(await backtests.getML(owner.id, id))) return { ok: false, message: MISSING };
  if (!(await allow("ml", 6, 60))) return { ok: false, message: TOO_MANY };
  return reproduceML(id, owner.id);
}
