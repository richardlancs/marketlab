/**
 * Share links for backtests: the settings travel in the link itself, after
 * the "#" (/backtest#run=…), so sharing needs no database and the page stays
 * static: browsers never send the "#" part to the server.
 *
 * The settings are JSON, made URL-safe with base64url. A link is untrusted
 * input like anything else, so opening one goes through parseConfig, exactly
 * as a saved run does.
 */
import { parseConfig, type BacktestConfig } from "./config";

/** Long enough for any valid config (rules included); anything longer isn't one of ours. */
const MAX_LENGTH = 4000;

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

/** The "#run=…" part of a share link for these settings. */
export const shareFragment = (config: BacktestConfig) => `run=${toBase64Url(JSON.stringify(config))}`;

/** The settings in a link's "#" part, or null if there are none or they aren't valid. */
export function parseShareFragment(hash: string, isKnown: (symbol: string) => boolean): BacktestConfig | null {
  const match = /^#?run=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!match || match[1].length > MAX_LENGTH) return null;
  try {
    return parseConfig(JSON.parse(fromBase64Url(match[1])), isKnown);
  } catch {
    return null; // not base64, or not JSON
  }
}
