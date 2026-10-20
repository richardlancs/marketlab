"use server";

/**
 * Server Actions for saved backtests, signed in or a guest (lib/owner.ts).
 * Like the account actions: whose runs they are comes from the session or
 * guest cookie, every argument is validated, and anything derived (the
 * results summary) is recomputed here from the server's own prices rather
 * than taken from the browser.
 */
import { MAX_RUN_NAME, MAX_SAVED_RUNS, parseConfig, parseSavedRun, summarize, type BacktestConfig, type SavedRun } from "./backtest/config";
import type { EngineName } from "./backtest/engines";
import { PythonEngineError, reproducePythonRun, savePythonRun } from "./backtest/python-client";
import { runFromSnapshot, runFull, runOnServer, sweepOnServer, type RunResult, type SweepOutcome } from "./backtest/server";
import { checksumOf } from "./backtest/snapshot";
import { compareResults, type Comparison, type StoredResult } from "./backtest/stored";
import type { Axis } from "./backtest/sweep";
import { backtests } from "./db";
import { isSymbolFormat } from "./market/symbols";
import { allow } from "./rate-limit";
import { currentOwner } from "./owner";

export type SaveResult = { ok: true; run: SavedRun } | { ok: false; message: string };

export async function saveBacktestAction(name: unknown, config: unknown): Promise<SaveResult> {
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName || cleanName.length > MAX_RUN_NAME) return { ok: false, message: `Give the run a name of up to ${MAX_RUN_NAME} characters.` };
  const parsed = parseConfig(config, isSymbolFormat);
  if (!parsed) return { ok: false, message: "Those backtest settings aren't valid." };

  // Each stock must exist, and the result comes from the server's own run
  // (cached: usually the one just shown), never from the browser. It's saved
  // whole, with the exact prices it was calculated from.
  const result = await runFull(parsed);
  if (!result.ok) return { ok: false, message: result.message };
  const summary = summarize(result.outcome);
  const { snapshot, ok: _ok, ...stored } = result;
  void _ok;

  const owner = await currentOwner({ create: true });
  if (!owner) return { ok: false, message: "Couldn't save the run. Reload the page and try again." };
  const run: SavedRun = {
    id: crypto.randomUUID(),
    name: cleanName,
    createdAt: Date.now(),
    config: parsed,
    summary,
    stored: { engine: stored.provenance.engine, dataSource: stored.provenance.dataset.source, simulated: stored.provenance.dataset.simulated, datasetVersion: stored.provenance.dataset.datasetVersion },
  };

  // A Python-engine run is saved by the Python service: it recalculates the
  // result from the snapshot itself and writes it, with the snapshot, to the
  // database, for the owner checked here.
  if (stored.provenance.engine.name === "python") {
    try {
      const saved = await savePythonRun({
        ownerId: owner.id,
        run: { id: run.id, name: run.name, createdAt: run.createdAt },
        config: parsed,
        snapshot,
        dataset: stored.provenance.dataset,
        note: stored.note,
        assumptions: { ...stored.provenance.assumptions },
      });
      return { ok: true, run: { ...run, summary: saved.summary } };
    } catch (error) {
      return { ok: false, message: error instanceof PythonEngineError ? error.message : "Couldn't save the run. Try again in a minute." };
    }
  }

  if (!(await backtests.save(owner.id, run, { result: stored, snapshot, checksum: checksumOf(snapshot) }))) return { ok: false, message: `You can save up to ${MAX_SAVED_RUNS} runs. Delete one to make room.` };
  return { ok: true, run };
}

export async function deleteBacktestAction(id: unknown): Promise<{ ok: boolean }> {
  const owner = await currentOwner({ create: false });
  if (!owner || typeof id !== "string") return { ok: false };
  await backtests.remove(owner.id, id); // only ever matches the caller's own runs
  return { ok: true };
}

/**
 * Brings in runs this browser saved in localStorage before saved runs moved
 * to the database. Each is validated like any saved run; they get new IDs,
 * and as many as fit under MAX_SAVED_RUNS are kept, newest first. Their
 * summaries are kept as they were: they're the user's own notes of past
 * results, and re-running them is one click.
 */
export async function importBrowserRunsAction(runs: unknown): Promise<{ ok: boolean; imported: number }> {
  if (!Array.isArray(runs) || runs.length > MAX_SAVED_RUNS) return { ok: false, imported: 0 };
  const valid = runs.map((r) => parseSavedRun(r, isSymbolFormat)).filter((r): r is SavedRun => r !== null);
  if (valid.length === 0) return { ok: true, imported: 0 };
  const owner = await currentOwner({ create: true });
  if (!owner) return { ok: false, imported: 0 };
  let imported = 0;
  for (const run of valid.sort((a, b) => b.createdAt - a.createdAt)) {
    if (!(await backtests.save(owner.id, { ...run, id: crypto.randomUUID() }))) break; // full
    imported++;
  }
  return { ok: true, imported };
}

const TOO_MANY = "You're running a lot of backtests. Wait a minute and try again.";
const INVALID = "Those backtest settings aren't valid.";

/**
 * Runs a backtest on the server and returns its results. Anyone can run one
 * (no account needed), so the settings are validated, and there's a
 * per-visitor limit; results are cached, so a popular link costs one run.
 */
export async function runBacktestAction(config: unknown): Promise<RunResult> {
  const parsed = parseConfig(config, isSymbolFormat);
  if (!parsed) return { ok: false, message: INVALID };
  if (!(await allow("backtest", 60, 60))) return { ok: false, message: TOO_MANY };
  return runOnServer(parsed);
}

/** Runs up to 4 saved runs' settings, for comparing them side by side. */
export async function compareRunsAction(configs: unknown): Promise<RunResult[] | { ok: false; message: string }> {
  if (!Array.isArray(configs) || configs.length < 2 || configs.length > 4) return { ok: false, message: "Choose 2 to 4 runs to compare." };
  const parsed = configs.map((c) => parseConfig(c, isSymbolFormat));
  if (parsed.some((c) => c === null)) return { ok: false, message: INVALID };
  if (!(await allow("backtest", 60, 60))) return { ok: false, message: TOO_MANY };
  return Promise.all((parsed as BacktestConfig[]).map(runOnServer));
}

const isAxis = (value: unknown): value is Axis => {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  return typeof a.param === "string" && a.param.length < 40 && [a.from, a.to, a.step].every((n) => typeof n === "number" && Number.isFinite(n));
};

/**
 * Runs a parameter sweep (up to 200 backtests) on the server. The sweep
 * checks the axes against the strategy and its limits; this checks their
 * shape, and allows a few sweeps a minute per visitor.
 */
export async function runSweepAction(base: unknown, axes: unknown): Promise<SweepOutcome> {
  const parsed = parseConfig(base, isSymbolFormat);
  if (!parsed) return { ok: false, message: INVALID };
  if (!Array.isArray(axes) || axes.length < 1 || axes.length > 2 || !axes.every(isAxis)) return { ok: false, message: "Choose one or two settings to vary." };
  if (!(await allow("sweep", 6, 60))) return { ok: false, message: "You're running a lot of sweeps. Wait a minute and try again." };
  return sweepOnServer(parsed, axes.map(({ param, from, to, step }) => ({ param, from, to, step })));
}

export type SavedResult = { ok: true; run: SavedRun; stored: StoredResult | null } | { ok: false; message: string };

/**
 * One of this visitor's saved runs, with its stored result: what opening a
 * saved run shows, exactly as it was calculated. Older runs (saved before
 * results were kept) come back with `stored: null`.
 */
export async function loadSavedRunAction(id: unknown): Promise<SavedResult> {
  if (typeof id !== "string" || id.length > 64) return { ok: false, message: "That saved run doesn't exist." };
  const owner = await currentOwner({ create: false });
  const found = owner ? await backtests.get(owner.id, id) : null; // only the owner's own runs
  if (!found) return { ok: false, message: "That saved run doesn't exist." };
  return { ok: true, run: found.run, stored: found.stored?.result ?? null };
}

export type ReproduceResult = { ok: true; reproduced: StoredResult; comparison: Comparison } | { ok: false; message: string };

/**
 * Calculates a saved run again from its saved input prices, with the engine
 * that calculated it, and compares the two: proof that the stored result
 * follows from its inputs. (Re-running with current prices is the separate
 * runBacktestAction.)
 */
export async function reproduceSavedRunAction(id: unknown): Promise<ReproduceResult> {
  if (typeof id !== "string" || id.length > 64) return { ok: false, message: "That saved run doesn't exist." };
  const owner = await currentOwner({ create: false });
  const found = owner ? await backtests.get(owner.id, id) : null;
  if (!owner || !found) return { ok: false, message: "That saved run doesn't exist." };
  if (!found.stored) return { ok: false, message: "This run was saved before MarketLab kept results and their input prices, so it can't be reproduced. Re-run it with current prices instead." };
  const config = parseConfig(found.run.config, isSymbolFormat);
  if (!config) return { ok: false, message: INVALID };
  const engine = found.stored.result.provenance.engine.name;
  if (engine !== "typescript" && engine !== "python") return { ok: false, message: `This run was calculated by an engine this server doesn't have (${engine}).` };
  if (!(await allow("backtest", 60, 60))) return { ok: false, message: TOO_MANY };
  // A Python-engine run is reproduced by the Python service, which reads the
  // run and its saved prices from the database itself (the owner's only).
  if (engine === "python") {
    try {
      const { reproduced, comparison } = await reproducePythonRun(found.run.id, owner.id);
      return { ok: true, reproduced, comparison };
    } catch (error) {
      return { ok: false, message: error instanceof PythonEngineError ? error.message : "Couldn't reproduce the run. Try again in a minute." };
    }
  }
  // Fresh, not from the cache: otherwise a recent run would just be handed back to itself.
  const result = await runFromSnapshot(config, found.stored.snapshot, engine as EngineName, { fresh: true });
  if (!result.ok) return { ok: false, message: result.message };
  const { ok: _ok, ...reproduced } = result;
  void _ok;
  return { ok: true, reproduced, comparison: compareResults(found.stored.result.outcome, reproduced.outcome) };
}
