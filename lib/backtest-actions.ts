"use server";

/**
 * Server Actions for signed-in users' saved backtests. Like the account
 * actions: the user comes from the session cookie, every argument is
 * validated, and anything derived (the results summary) is recomputed here
 * from the server's own prices rather than taken from the browser.
 */
import { headers } from "next/headers";
import { auth } from "./auth";
import { MAX_RUN_NAME, MAX_SAVED_RUNS, parseConfig, runConfig, summarize, type SavedRun } from "./backtest/config";
import { backtests } from "./db";
import { getMarket, STOCK_SYMBOLS } from "./market";

export type SaveResult = { ok: true; run: SavedRun } | { ok: false; message: string };

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function saveBacktestAction(name: unknown, config: unknown): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Your session has ended. Sign in again to save runs." };
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName || cleanName.length > MAX_RUN_NAME) return { ok: false, message: `Give the run a name of up to ${MAX_RUN_NAME} characters.` };
  const parsed = parseConfig(config, STOCK_SYMBOLS);
  if (!parsed) return { ok: false, message: "Those backtest settings aren't valid." };

  const market = await getMarket();
  const history = Object.fromEntries(market.stocks.map((s) => [s.symbol, s.history]));
  let summary;
  try {
    summary = summarize(runConfig(parsed, history, market.indices[0].history));
  } catch {
    return { ok: false, message: "That backtest couldn't be run with the current prices." };
  }

  const run: SavedRun = { id: crypto.randomUUID(), name: cleanName, createdAt: Date.now(), config: parsed, summary };
  if (!(await backtests.save(userId, run))) return { ok: false, message: `You can save up to ${MAX_SAVED_RUNS} runs. Delete one to make room.` };
  return { ok: true, run };
}

export async function deleteBacktestAction(id: unknown): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId || typeof id !== "string") return { ok: false };
  await backtests.remove(userId, id); // only ever matches the caller's own runs
  return { ok: true };
}
