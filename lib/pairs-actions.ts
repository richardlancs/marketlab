"use server";

/**
 * Server Actions for the pairs-trading lab (lib/pairs): scan for pairs, and
 * test one. Anyone can use them; arguments are validated, the stocks are the
 * catalog's, and a scan (hundreds of tests) is limited to a few a minute.
 */
import { catalogEntry } from "./market/catalog";
import { scanPairs, testPair } from "./pairs/server";
import { parsePairSettings, type PairScan, type PairTest } from "./pairs/types";
import { allow } from "./rate-limit";

const isKnown = (symbol: string) => !!catalogEntry(symbol);
/** The earliest formation end the lab accepts: before this the store has no prices worth pairing. */
const EARLIEST = Date.UTC(2000, 0, 1);

export async function scanPairsAction(formationEnd: unknown): Promise<{ ok: true; result: PairScan } | { ok: false; message: string }> {
  if (!Number.isInteger(formationEnd) || (formationEnd as number) < EARLIEST || (formationEnd as number) > Date.now()) return { ok: false, message: "Choose a date for the end of the formation year." };
  if (!(await allow("pairs", 6, 60))) return { ok: false, message: "You're scanning a lot. Wait a minute and try again." };
  return scanPairs(formationEnd as number);
}

export async function testPairAction(settings: unknown): Promise<{ ok: true; result: PairTest } | { ok: false; message: string }> {
  const parsed = parsePairSettings(settings, isKnown);
  if (!parsed) return { ok: false, message: "Those settings aren't valid: pick two different stocks, and levels with exit below entry below stop." };
  if (!(await allow("backtest", 60, 60))) return { ok: false, message: "You're running a lot of tests. Wait a minute and try again." };
  return testPair(parsed);
}
