import type { Metadata } from "next";
import { BacktestWorkbench } from "@/components/backtest/backtest-workbench";
import { MLSandbox } from "@/components/backtest/ml-sandbox";
import { Tabs } from "@/components/ui/tabs";
import { DataSource } from "@/components/market/data-source";
import { getMarket } from "@/lib/market";

export const metadata: Metadata = { title: "Backtest — MarketLab" };

/**
 * Try a strategy on past prices. The page itself only sends the dates
 * available (from the core stocks; others may start later); the stock list
 * comes from the layout, and prices load when a backtest runs.
 */
export default async function BacktestPage() {
  const { stocks } = await getMarket();
  const firstDate = Math.max(...stocks.map((s) => s.history[0].time));
  const lastDate = Math.min(...stocks.map((s) => s.history[s.history.length - 1].time));

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <DataSource />
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Backtest</h1>
        <p className="mt-2 max-w-2xl text-muted">
          See how a strategy would have done over past prices, compared with a simple benchmark. Past results don&apos;t predict future ones.
        </p>
      </div>
      <Tabs
        className="mt-6"
        label="Backtest tools"
        tabs={[
          { id: "strategies", label: "Strategies", content: <BacktestWorkbench firstDate={firstDate} lastDate={lastDate} /> },
          { id: "ml", label: "Machine learning", content: <MLSandbox lastDate={lastDate} /> },
        ]}
      />
    </main>
  );
}
