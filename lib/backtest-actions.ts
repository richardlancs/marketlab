"use server";

/**
 * Server Actions for saved backtests, signed in or a guest (lib/owner.ts).
 * Like the account actions: whose runs they are comes from the session or
 * guest cookie, every argument is validated, and anything derived (the
 * results summary) is recomputed here from the server's own prices rather
 * than taken from the browser.
 */
import { MAX_RUN_NAME, MAX_SAVED_RUNS, parseConfig, parseSavedRun, summarize, type BacktestConfig, type SavedRun } from "./backtest/config";
import { runOnServer, sweepOnServer, type RunResult, type SweepOutcome } from "./backtest/server";
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

  // Each stock must exist, and the summary comes from the server's own run (cached: usually the one just shown).
  const result = await runOnServer(parsed);
  if (!result.ok) return { ok: false, message: result.message };
  const summary = summarize(result.outcome);

  const owner = await currentOwner({ create: true });
  if (!owner) return { ok: false, message: "Couldn't save the run. Reload the page and try again." };
  const run: SavedRun = { id: crypto.randomUUID(), name: cleanName, createdAt: Date.now(), config: parsed, summary };
  if (!(await backtests.save(owner.id, run))) return { ok: false, message: `You can save up to ${MAX_SAVED_RUNS} runs. Delete one to make room.` };
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
