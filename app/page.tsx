import { DataSource } from "@/components/market/data-source";
import { FeaturedStock } from "@/components/dashboard/featured-stock";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { TopMovers } from "@/components/dashboard/top-movers";
import { WatchlistPreview } from "@/components/dashboard/watchlist-preview";
import { Tabs } from "@/components/ui/tabs";

export default function Home() {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <DataSource />
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
        <p className="mt-2 text-muted">A snapshot of markets, your watchlist, and your simulated portfolio.</p>
      </div>

      {/* One section at a time: the markets first, the rest a tab away. */}
      <Tabs
        className="mt-6"
        label="Dashboard sections"
        tabs={[
          {
            id: "markets",
            label: "Markets",
            content: (
              <div className="flex flex-col gap-4 lg:gap-6">
                <MarketOverview />
                <FeaturedStock />
              </div>
            ),
          },
          { id: "watchlist", label: "Watchlist", content: <WatchlistPreview /> },
          { id: "movers", label: "Top movers", content: <TopMovers /> },
          { id: "portfolio", label: "Portfolio", content: <PortfolioSummary /> },
        ]}
      />
    </main>
  );
}
