"use client";

import { useServiceData } from "@/components/ui/service-data";
import type { Performance } from "@/lib/portfolio-performance";
import type { Account } from "@/lib/trading";
import type { Timeframe } from "@/lib/types";

export interface IndexChoice {
  symbol: string;
  name: string;
}

/** What /api/portfolio/performance answers: the result, and which index it's against. */
export type PerformanceResponse = Performance & { indices: IndexChoice[]; index: IndexChoice };

export type PortfolioPerformance = { status: "loading" } | { status: "error"; message: string; retry: () => void } | PerformanceResponse;

/**
 * The portfolio's performance over `range` against an index, computed on
 * the server (app/api/portfolio/performance, by the analytics service) from
 * the account and its cached prices. Fetched again when the range, the index
 * or the account changes (a trade, a dividend); while the next one loads,
 * the last result stays up. A failure retries once by itself.
 */
export function usePortfolioPerformance(account: Account | null, index: string | null, range: Timeframe): PortfolioPerformance {
  // What the result depends on: the range, the index, and anything that changes the account's value history.
  const version = account ? JSON.stringify([account.cash, account.holdings, account.trades.length, account.events?.length ?? 0, account.processedThrough ?? 0]) : null;
  const query = new URLSearchParams({ range, ...(index && { index }), ...(version && { v: version }) });
  const state = useServiceData<PerformanceResponse>(version ? { url: `/api/portfolio/performance?${query}` } : null);
  if (state.status === "ok") return state.data;
  if (state.status === "error") return { status: "error", message: state.message, retry: state.retry };
  return { status: "loading" };
}
