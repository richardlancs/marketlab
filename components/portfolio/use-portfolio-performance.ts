"use client";

import { useEffect, useState } from "react";
import type { Performance } from "@/lib/portfolio-performance";
import type { Account } from "@/lib/trading";
import type { Timeframe } from "@/lib/types";

export interface IndexChoice {
  symbol: string;
  name: string;
}

/** What /api/portfolio/performance answers: the result, and which index it's against. */
export type PerformanceResponse = Performance & { indices: IndexChoice[]; index: IndexChoice };

export type PortfolioPerformance = { status: "loading" } | { status: "error"; message: string } | PerformanceResponse;

/**
 * The portfolio's performance over `range` against an index, computed on
 * the server (app/api/portfolio/performance) from the account and its cached
 * prices. Fetched again when the range, the index or the account changes
 * (a trade, a dividend); while the next one loads, the last result stays up.
 */
export function usePortfolioPerformance(account: Account | null, index: string | null, range: Timeframe): PortfolioPerformance {
  // What the result depends on: the range, the index, and anything that changes the account's value history.
  const key = account
    ? JSON.stringify([range, index, account.cash, account.holdings, account.trades.length, account.events?.length ?? 0, account.processedThrough ?? 0])
    : null;
  const [result, setResult] = useState<{ key: string; value: PortfolioPerformance } | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const query = new URLSearchParams({ range, ...(index && { index }) });
    fetch(`/api/portfolio/performance?${query}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(
        (data: PerformanceResponse) => !cancelled && setResult({ key, value: data }),
        () => !cancelled && setResult({ key, value: { status: "error", message: "Couldn't load your performance. Check your connection and try again." } }),
      );
    return () => {
      cancelled = true;
    };
    // `key` stands for range, index and the account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (result && result.key === key) return result.value;
  // Still loading the new one: keep showing the last result, if there is one.
  return result?.value.status === "ok" ? result.value : { status: "loading" };
}
