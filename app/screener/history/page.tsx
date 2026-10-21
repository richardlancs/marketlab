import type { Metadata } from "next";
import Link from "next/link";
import { DataSource } from "@/components/market/data-source";
import { ScreenHistory } from "@/components/screener/screen-history";
import { getMarket } from "@/lib/market";

export const metadata: Metadata = { title: "Test a screen over time — MarketLab" };

/**
 * Historical screening: the Momentum leaders screen applied at the start of
 * every month, using only the prices known then (lib/analytics/history.ts).
 * The page sends the dates available; the screen runs when asked.
 */
export default async function ScreenHistoryPage() {
  const { stocks } = await getMarket();
  const firstDate = Math.max(...stocks.map((s) => s.history[0].time));
  const lastDate = Math.min(...stocks.map((s) => s.history[s.history.length - 1].time));

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <DataSource />
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Test a screen over time</h1>
        <p className="mt-2 max-w-2xl text-muted">
          If you had run the{" "}
          <Link href="/screener?preset=momentum" className="text-accent hover:underline">
            Momentum leaders
          </Link>{" "}
          screen at the start of every month, using only what was known at the time, which stocks would you have owned, and how would they have done?
        </p>
      </div>
      <div style={{ animationDelay: "60ms" }} className="mt-8 animate-fade-up">
        <ScreenHistory firstDate={firstDate} lastDate={lastDate} />
      </div>
    </main>
  );
}
