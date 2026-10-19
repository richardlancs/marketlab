"use client";

import { useEffect, useState } from "react";
import type { Account } from "@/lib/trading";
import { relevantSymbols } from "@/lib/portfolio-history";
import type { PricePoint } from "@/lib/types";

export interface IndexHistory {
  symbol: string;
  name: string;
  history: PricePoint[];
}

export type PortfolioHistory =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; history: Record<string, PricePoint[]>; indices: IndexHistory[] };

/**
 * Daily prices for every stock the account holds or has traded, plus the
 * three indices to compare with. Loaded from /api/history (which reads the
 * server's hourly cache, so it costs no extra data-source requests) and only
 * on the portfolio page, so other pages stay light. Fetched again only when
 * the set of stocks changes, not on every trade.
 */
export function usePortfolioHistory(account: Account | null): PortfolioHistory {
  const key = account ? relevantSymbols(account).sort().join(",") : null;
  const [result, setResult] = useState<{ key: string; value: PortfolioHistory } | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const query = [...(key ? key.split(",").map((s) => `symbol=${encodeURIComponent(s)}`) : []), "indices=all"].join("&");
    fetch(`/api/history?${query}`)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Couldn't load prices. Check your connection and try again.");
        return body as { history: Record<string, PricePoint[]>; indices: IndexHistory[] };
      })
      .then(
        (data) => !cancelled && setResult({ key, value: { status: "ready", history: data.history, indices: data.indices } }),
        (error: Error) => !cancelled && setResult({ key, value: { status: "error", message: error.message } }),
      );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return result && result.key === key ? result.value : { status: "loading" };
}
