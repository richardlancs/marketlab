import type { Metadata } from "next";
import { Suspense } from "react";
import { Screener } from "@/components/screener/screener";
import { ScreenerTabs } from "@/components/screener/screener-tabs";
import { Card } from "@/components/ui/card";
import { getScreenerData } from "@/lib/analytics/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Screener — MarketLab" };

/**
 * Every catalog stock with its risk, momentum and technical numbers
 * (calculated nightly by the analytics service), filtered and sorted in the
 * browser. The shell shows at once; the rows stream in.
 */
export default function ScreenerPage(props: PageProps<"/screener">) {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Screener</h1>
        <p className="mt-2 text-muted">Filter the market by momentum, risk, technicals and value. Start from a preset, or set your own ranges.</p>
        <ScreenerTabs current="/screener" />
      </div>
      <div style={{ animationDelay: "60ms" }} className="mt-8 animate-fade-up">
        <Suspense fallback={<ScreenerSkeleton />}>
          <ScreenerData searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function ScreenerData({ searchParams }: { searchParams: PageProps<"/screener">["searchParams"] }) {
  const { preset } = await searchParams;
  const data = await getScreenerData();
  if (data.status !== "ok") {
    return (
      <Card>
        <p className="text-sm text-muted">{data.reason}</p>
      </Card>
    );
  }
  return (
    <>
      <p className="-mt-6 mb-6 text-xs text-muted">As of the {formatDate(data.asOf)} close.</p>
      <Screener rows={data.rows} asOf={data.asOf} initialPreset={typeof preset === "string" ? preset : undefined} />
    </>
  );
}

function ScreenerSkeleton() {
  const block = "animate-pulse rounded-lg bg-foreground/[0.06]";
  return (
    <div aria-busy className="flex flex-col gap-4">
      <span className="sr-only">Loading the screener…</span>
      <div className={`h-9 w-full max-w-xl ${block}`} />
      <div className={`h-40 ${block}`} />
      <div className={`h-96 ${block}`} />
    </div>
  );
}
