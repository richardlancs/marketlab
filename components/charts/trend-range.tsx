"use client";

import { createContext, use, useCallback, useSyncExternalStore, type ReactNode } from "react";
import { TIMEFRAMES, type Timeframe } from "@/lib/types";

const KEY = "marketlab:range";
const DEFAULT: Timeframe = "1M";

/**
 * The time range every price chart shows: the big chart on the dashboard and
 * stock pages, and every small trend line in lists. Changing it anywhere
 * changes it everywhere, and it's remembered in this browser (a convenience
 * only: without storage it just starts at 1M each visit).
 */
const listeners = new Set<() => void>();
let memory: Timeframe = DEFAULT; // used when storage is blocked

function read(): Timeframe {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && (TIMEFRAMES as readonly string[]).includes(saved)) return saved as Timeframe;
  } catch {
    // blocked storage: fall back to memory
  }
  return memory;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => event.key === KEY && listener();
  window.addEventListener("storage", onStorage); // another tab changed it
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const RangeContext = createContext<{ range: Timeframe; setRange: (next: Timeframe) => void } | null>(null);

export function TrendRangeProvider({ children }: { children: ReactNode }) {
  // The server (and hydration) always sees the default; the saved range applies right after.
  const range = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const setRange = useCallback((next: Timeframe) => {
    memory = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // blocked storage: kept in memory for this visit
    }
    listeners.forEach((l) => l());
  }, []);
  return <RangeContext value={{ range, setRange }}>{children}</RangeContext>;
}

export function useTrendRange() {
  const value = use(RangeContext);
  if (!value) throw new Error("useTrendRange must be used inside <TrendRangeProvider>");
  return value;
}
