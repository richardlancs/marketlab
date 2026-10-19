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
import type { PricePoint } from "./types";
import { getMarket, getStockDetail } from "./market";
import { isSymbolFormat } from "./market/symbols";

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
  const parsed = parseConfig(config, isSymbolFormat);
  if (!parsed) return { ok: false, message: "Those backtest settings aren't valid." };

  // Each stock must exist, and its prices come from the server's own data.
  const details = await Promise.all(parsed.holdings.map((h) => getStockDetail(h.symbol)));
  const history: Record<string, PricePoint[]> = {};
  for (const [i, detail] of details.entries()) {
    const symbol = parsed.holdings[i].symbol;
    if (!detail) return { ok: false, message: `Unknown stock: ${symbol}.` };
    if (detail.status === "unavailable") return { ok: false, message: `Prices for ${symbol} are unavailable right now. Try again in a minute.` };
    history[symbol] = detail.stock.history;
  }
  const market = await getMarket();
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
