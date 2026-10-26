import type { Metadata } from "next";
import { BookSwitcher } from "@/components/account/book-switcher";
import { StorageLabel } from "@/components/account/storage-label";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { FactorCard } from "@/components/portfolio/factor-card";
import { LeaderboardCard } from "@/components/portfolio/leaderboard-card";
import { OpenOrders } from "@/components/portfolio/open-orders";
import { PerformanceCard } from "@/components/portfolio/performance-card";
import { PortfolioStats } from "@/components/portfolio/portfolio-stats";
import { RiskAnalysis } from "@/components/portfolio/risk-analysis";
import { SeasonCard } from "@/components/portfolio/season-card";
import { SectorCard } from "@/components/portfolio/sector-card";
import { TradeHistory } from "@/components/portfolio/trade-history";
import { Tabs } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Portfolio — MarketLab" };

/** The simulated portfolio in full. Everything on it is saved in the browser, so the cards are client components. */
export default function PortfolioPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <StorageLabel prefix="Simulated" />
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Portfolio</h1>
        <p className="mt-2 text-muted">Your holdings at today&apos;s prices, and every trade you&apos;ve made.</p>
        <BookSwitcher className="mt-4" />
      </div>

      <Tabs
        className="mt-6"
        label="Portfolio sections"
        tabs={[
          {
            id: "holdings",
            label: "Holdings",
            content: (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
                <div className="lg:col-span-8">
                  <PortfolioSummary showDetailsLink={false} />
                </div>
                <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-6">
                  <PortfolioStats />
                  <SectorCard />
                </div>
              </div>
            ),
          },
          { id: "orders", label: "Orders", content: <OpenOrders />, empty: "No orders yet. Place a limit or stop order from any stock's page." },
          { id: "performance", label: "Performance", content: <PerformanceCard /> },
          {
            id: "risk",
            label: "Risk",
            content: (
              <div className="flex flex-col gap-4 lg:gap-6">
                <RiskAnalysis />
                <FactorCard />
              </div>
            ),
          },
          { id: "activity", label: "Activity", content: <TradeHistory /> },
          {
            id: "compete",
            label: "Compete",
            content: (
              <>
                <SeasonCard />
                <LeaderboardCard />
              </>
            ),
            empty: "No competitions to show for this portfolio right now.",
          },
        ]}
      />
    </main>
  );
}
