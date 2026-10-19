import type { Metadata } from "next";
import { StorageLabel } from "@/components/account/storage-label";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { PortfolioStats } from "@/components/portfolio/portfolio-stats";
import { TradeHistory } from "@/components/portfolio/trade-history";

export const metadata: Metadata = { title: "Portfolio — MarketLab" };

/** The simulated portfolio in full. Everything on it is saved in the browser, so the cards are client components. */
export default function PortfolioPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <StorageLabel prefix="Simulated" />
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Portfolio</h1>
        <p className="mt-2 text-muted">Your holdings at today&apos;s prices, and every trade you&apos;ve made.</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <div style={{ animationDelay: "60ms" }} className="animate-fade-up lg:col-span-8">
          <PortfolioSummary showDetailsLink={false} />
        </div>
        <div style={{ animationDelay: "120ms" }} className="animate-fade-up lg:col-span-4">
          <PortfolioStats />
        </div>
        <div style={{ animationDelay: "180ms" }} className="animate-fade-up lg:col-span-12">
          <TradeHistory />
        </div>
      </div>
    </main>
  );
}
