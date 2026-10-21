"use server";

/**
 * Server Actions for historical screening (lib/analytics/history.ts): run a
 * screen over the past, and save, list, open and reproduce runs. As with
 * saved backtests (lib/backtest-actions.ts): whose runs they are comes from
 * the session or guest cookie, every argument is validated, the candidates
 * are the server's own catalog, and results are calculated by the analytics
 * service from stored prices, never taken from the browser.
 */
import { parseScreenSettings, type SavedScreen, type ScreenResult } from "./analytics/history";
import { reproduceScreenOnServer, saveScreenOnServer, screenConfigOf, screenHistoryOnServer } from "./analytics/server";
import { MAX_RUN_NAME, MAX_SAVED_RUNS } from "./backtest/config";
import type { Comparison } from "./backtest/stored";
import { backtests } from "./db";
import { currentOwner } from "./owner";
import { allow } from "./rate-limit";

const INVALID = "Those settings aren't valid.";
const TOO_MANY = "You're running a lot of historical screens. Wait a minute and try again.";
const MISSING = "That saved run doesn't exist.";

export type ScreenRunResult = { ok: true; result: ScreenResult } | { ok: false; message: string };

/** Applies the screen at the start of every month over the chosen period. Anyone can run one, a few a minute. */
export async function runScreenHistoryAction(settings: unknown): Promise<ScreenRunResult> {
  const parsed = parseScreenSettings(settings);
  if (!parsed) return { ok: false, message: INVALID };
  if (!(await allow("screen-history", 6, 60))) return { ok: false, message: TOO_MANY };
  return screenHistoryOnServer(parsed);
}

export type SaveScreenResult = { ok: true; run: SavedScreen; result: ScreenResult } | { ok: false; message: string };

/**
 * Saves a historical screen: the service calculates it again from the
 * stored prices and saves the result with every candidate's prices, so it
 * can be reproduced later. Counts towards the saved-run limit.
 */
export async function saveScreenAction(name: unknown, settings: unknown): Promise<SaveScreenResult> {
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName || cleanName.length > MAX_RUN_NAME) return { ok: false, message: `Give the run a name of up to ${MAX_RUN_NAME} characters.` };
  const parsed = parseScreenSettings(settings);
  if (!parsed) return { ok: false, message: INVALID };
  if (!(await allow("screen-history", 6, 60))) return { ok: false, message: TOO_MANY };
  const owner = await currentOwner({ create: true });
  if (!owner) return { ok: false, message: "Couldn't save the run. Reload the page and try again." };
  const config = screenConfigOf(parsed);
  const run = { id: crypto.randomUUID(), name: cleanName, createdAt: Date.now() };
  const saved = await saveScreenOnServer(owner.id, run, config);
  if (!saved.ok) return saved;
  const { provenance } = saved.result;
  return {
    ok: true,
    run: {
      ...run,
      config,
      summary: saved.summary,
      stored: { engine: provenance.engine, dataSource: provenance.dataset.source, simulated: provenance.dataset.simulated, datasetVersion: provenance.dataset.datasetVersion },
    },
    result: saved.result,
  };
}

/** This visitor's saved historical screens, newest first. */
export async function listSavedScreensAction(): Promise<{ runs: SavedScreen[]; limit: number }> {
  const owner = await currentOwner({ create: false });
  return { runs: owner ? await backtests.listScreens(owner.id) : [], limit: MAX_SAVED_RUNS };
}

export type SavedScreenResult = { ok: true; run: SavedScreen; result: ScreenResult } | { ok: false; message: string };

/** One of this visitor's saved screens with its stored result, exactly as it was calculated. */
export async function loadSavedScreenAction(id: unknown): Promise<SavedScreenResult> {
  if (typeof id !== "string" || id.length > 64) return { ok: false, message: MISSING };
  const owner = await currentOwner({ create: false });
  const found = owner ? await backtests.getScreen(owner.id, id) : null; // only the owner's own runs
  if (!found) return { ok: false, message: MISSING };
  if (!found.result) return { ok: false, message: "This run's stored result couldn't be read." };
  return { ok: true, run: found.run, result: found.result };
}

export type ReproduceScreenResult = { ok: true; reproduced: ScreenResult; comparison: Comparison } | { ok: false; message: string };

/**
 * Calculates a saved screen again from its saved prices (not today's) and
 * compares the two. The service reads the run itself, for this owner only.
 */
export async function reproduceSavedScreenAction(id: unknown): Promise<ReproduceScreenResult> {
  if (typeof id !== "string" || id.length > 64) return { ok: false, message: MISSING };
  const owner = await currentOwner({ create: false });
  if (!owner || !(await backtests.getScreen(owner.id, id))) return { ok: false, message: MISSING };
  if (!(await allow("screen-history", 6, 60))) return { ok: false, message: TOO_MANY };
  return reproduceScreenOnServer(id, owner.id);
}
