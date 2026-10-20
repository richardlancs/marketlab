/**
 * Which lessons' tests this browser has passed. Kept in localStorage only:
 * it's a convenience, not an account feature, so it never reaches the server.
 * Like everything read from storage, it's validated, and it fails quietly
 * (private mode, blocked storage) so lessons always work.
 */
import { GLOSSARY, type TermKey } from "../glossary";

const KEY = "learn-progress";
const VERSION = 1;
/** Sent when progress changes in this tab ("storage" events only fire in other tabs). */
const EVENT = "learn-progress";

/** A test is passed with at least this share of right answers (3 of 4). */
export const PASS_SHARE = 0.75;
export const passed = (score: number, total: number) => total > 0 && score >= Math.ceil(total * PASS_SHARE);

/** Reads saved progress, keeping only real term keys. */
export function parseProgress(raw: string | null): TermKey[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as { version?: unknown; passed?: unknown };
    if (value.version !== VERSION || !Array.isArray(value.passed)) return [];
    return [...new Set(value.passed.filter((k): k is TermKey => typeof k === "string" && Object.hasOwn(GLOSSARY, k)))];
  } catch {
    return [];
  }
}

export const serializeProgress = (terms: TermKey[]) => JSON.stringify({ version: VERSION, passed: [...new Set(terms)] });

// The last value read, so useSyncExternalStore gets the same array until something changes.
let cache: { raw: string | null; terms: TermKey[] } = { raw: null, terms: [] };

export function readProgress(): TermKey[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Unavailable: no progress.
  }
  if (raw !== cache.raw) cache = { raw, terms: parseProgress(raw) };
  return cache.terms;
}

export function markPassed(term: TermKey) {
  const current = readProgress();
  if (current.includes(term)) return;
  try {
    localStorage.setItem(KEY, serializeProgress([...current, term]));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeProgress(onChange: () => void) {
  const onStorage = (event: StorageEvent) => event.key === KEY && onChange();
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const NONE: TermKey[] = [];
/** On the server (and before hydration) nothing is passed, so the HTML matches. */
export const serverProgress = () => NONE;
