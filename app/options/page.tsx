import type { Metadata } from "next";
import { OptionsLab } from "@/components/options/options-lab";
import { CATALOG } from "@/lib/market/catalog";

export const metadata: Metadata = { title: "Options lab — MarketLab", description: "Learn how options are priced: a simulated option chain, the Greeks, implied volatility and payoff diagrams." };

/**
 * The options lab: learning only. The chain is simulated from each stock's
 * own price and volatility (there's no real options data here), and options
 * can't be traded in portfolios.
 */
export default function OptionsPage() {
  const stocks = CATALOG.map(({ symbol, name }) => ({ symbol, name }));
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <p className="text-sm font-medium text-accent">Simulated · for learning</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Options lab</h1>
        <p className="mt-2 max-w-2xl text-muted">
          See how options are priced and how they behave. The chain is simulated with the Black-Scholes model from each stock&apos;s own price and volatility: real options differ, and can&apos;t be traded here.
        </p>
      </div>
      <div style={{ animationDelay: "60ms" }} className="mt-8 animate-fade-up">
        <OptionsLab stocks={stocks} />
      </div>
    </main>
  );
}
