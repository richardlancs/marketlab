import type { ReactNode } from "react";
import { FeaturedStock } from "@/components/dashboard/featured-stock";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { TopMovers } from "@/components/dashboard/top-movers";
import { WatchlistPreview } from "@/components/dashboard/watchlist-preview";

/**
 * Wraps a dashboard section in its grid cell and fades it in. `order` sets the
 * entrance delay, so sections appear one after another, top to bottom.
 */
function Cell({ order, className, children }: { order: number; className: string; children: ReactNode }) {
  return (
    <div style={{ animationDelay: `${order * 60}ms` }} className={`animate-fade-up ${className}`}>
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <p className="text-sm font-medium text-accent">Mock data</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
        <p className="mt-2 text-muted">A snapshot of markets, your watchlist, and your simulated portfolio.</p>
      </div>

      {/* The three index cards animate in on their own (delays 1–3). */}
      <div className="mt-8">
        <MarketOverview />
      </div>

      {/*
       * One column on phones and tablets, a 12-column grid from 1024px (lg).
       * The chart takes 8 of 12 columns with the watchlist beside it; the
       * bottom row splits 6 + 6.
       */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-6 lg:grid-cols-12 lg:gap-6">
        <Cell order={4} className="lg:col-span-8">
          <FeaturedStock />
        </Cell>
        <Cell order={5} className="lg:col-span-4">
          <WatchlistPreview />
        </Cell>
        <Cell order={6} className="lg:col-span-6">
          <TopMovers />
        </Cell>
        <Cell order={7} className="lg:col-span-6">
          <PortfolioSummary />
        </Cell>
      </div>
    </main>
  );
}
