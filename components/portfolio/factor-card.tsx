"use client";

import { FactorExposuresView } from "@/components/analytics/factor-exposures";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { ServiceError, useServiceData } from "@/components/ui/service-data";
import type { FactorExposures } from "@/lib/analytics/factors";

type Answer = { empty: true } | { empty?: false; factors: FactorExposures };

/**
 * What drives the portfolio: its exposures to the five factors, holding
 * today's weights over the past year (app/api/portfolio/factors). Loaded
 * again after every trade.
 */
export function FactorCard() {
  const { account } = useAccount();
  const holdings = account ? account.holdings.map((h) => [h.symbol, h.shares]) : null;
  const state = useServiceData<Answer>(holdings ? { url: `/api/portfolio/factors?h=${encodeURIComponent(JSON.stringify(holdings))}` } : null);

  return (
    <Card aria-labelledby="portfolio-factors">
      <h2 id="portfolio-factors" className="text-lg font-semibold tracking-tight">
        What drives your portfolio
      </h2>
      {state.status === "loading" && <div aria-busy className="mt-4 h-40 animate-pulse rounded-lg bg-foreground/[0.06]" />}
      {state.status === "error" && <ServiceError message={state.message} onRetry={state.retry} />}
      {state.status === "ok" &&
        (state.data.empty ? (
          <p className="mt-3 text-sm text-muted">Buy a stock or two, and this shows how your mix leans: towards the market, small or large companies, value or growth, recent winners or calm stocks.</p>
        ) : (
          <div className="mt-3">
            <FactorExposuresView exposures={state.data.factors} subject="Your portfolio" />
          </div>
        ))}
    </Card>
  );
}
