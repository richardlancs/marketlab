import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertCard } from "@/components/alerts/alert-card";
import { PriceChart } from "@/components/charts/price-chart";
import { OpenOrders } from "@/components/portfolio/open-orders";
import { PositionCard } from "@/components/stocks/position-card";
import { RangeBar } from "@/components/stocks/range-bar";
import { StockAnalysis } from "@/components/stocks/stock-analysis";
import { StockNews } from "@/components/stocks/stock-news";
import { StockStats } from "@/components/stocks/stock-stats";
import { TradeCard } from "@/components/stocks/trade-card";
import { WatchToggle } from "@/components/stocks/watch-toggle";
import { Card } from "@/components/ui/card";
import { sliceTimeframe } from "@/lib/chart";
import { getListing, getStockDetail, STOCK_SYMBOLS } from "@/lib/market";
import type { Listing } from "@/lib/market";
import { StockLogo } from "@/components/stocks/stock-logo";

/**
 * Tells Next.js which pages to build ahead of time (at `npm run build`): the
 * ten core stocks. Any other stock's page is built on its first visit (the
 * skeleton below shows at once, then the details stream in) and stored, so
 * later visits are instant too. Unknown symbols never get here: proxy.ts
 * answers them with a 404.
 */
export async function generateStaticParams() {
  return STOCK_SYMBOLS.map((symbol) => ({ symbol }));
}

// `params` is a Promise in this version of Next.js, so it's awaited.
// PageProps<"/stocks/[symbol]"> is a global type Next.js generates from the folder name.
export async function generateMetadata(props: PageProps<"/stocks/[symbol]">): Promise<Metadata> {
  const { symbol } = await props.params;
  const listing = await getListing(symbol);
  return { title: listing ? `${listing.symbol} · ${listing.name} — MarketLab` : "Stock not found — MarketLab" };
}

/**
 * The page itself doesn't await `params`, so the parts that don't depend on the
 * symbol (the back link, the skeleton) form a shell that shows the moment a
 * link is clicked. Everything that needs the symbol is in <StockDetails>,
 * behind Suspense. For the ten symbols built ahead of time, the details are
 * already in the HTML, so the skeleton only shows during client navigation.
 * For other stocks it also shows on the very first visit, while the page is
 * built.
 */
export default function StockPage(props: PageProps<"/stocks/[symbol]">) {
  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Link href="/stocks" className="animate-fade-up text-sm text-accent hover:underline">
        ← All stocks
      </Link>
      <Suspense fallback={<StockDetailsSkeleton />}>
        <StockDetails params={props.params} />
      </Suspense>
    </main>
  );
}

async function StockDetails({ params }: { params: PageProps<"/stocks/[symbol]">["params"] }) {
  const { symbol } = await params;
  const detail = await getStockDetail(symbol);
  // Renders the nearest not-found.tsx. It throws, so nothing below runs.
  // proxy.ts already rejects unknown and lowercase symbols with real 404 and
  // 308 status codes before this page runs; this is a fallback (and, with
  // Tiingo, the check for well-formed tickers that don't exist).
  if (!detail) notFound();
  if (detail.status === "unavailable") return <PricesUnavailable listing={detail.listing} />;
  const { stock } = detail;
  const quote = { symbol: stock.symbol, name: stock.name, price: stock.price, change: stock.change, changePercent: stock.changePercent };

  // The 52-week range: daily closes for the past year, plus today's high and low.
  const yearPrices = sliceTimeframe(stock.history, "1Y").map((p) => p.price);
  const yearLow = Math.min(...yearPrices, stock.low);
  const yearHigh = Math.max(...yearPrices, stock.high);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div style={{ animationDelay: "60ms" }} className="animate-fade-up lg:col-span-8">
        <Card aria-labelledby="stock-title">
          <PriceChart
            history={stock.history}
            intraday={stock.intraday}
            today={{ change: stock.change, percent: stock.changePercent }}
            title={
              <div className="flex min-w-0 items-center gap-3.5">
                <StockLogo symbol={stock.symbol} size={48} />
                <div className="min-w-0">
                <h1 id="stock-title" className="text-2xl font-semibold tracking-tight">
                  {stock.symbol} <span className="font-normal text-muted">{stock.name}</span>
                </h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  {stock.sector ?? "Sector not available"}
                  <WatchToggle symbol={stock.symbol} />
                </p>
                </div>
              </div>
            }
          />
          <StockStats stock={stock} className="mt-6" />
        </Card>
        {/* Calculated by the analytics service from stored prices; the page doesn't wait for it. */}
        <div className="mt-4 lg:mt-6">
          <Suspense fallback={<AnalysisSkeleton />}>
            <StockAnalysis symbol={stock.symbol} />
          </Suspense>
        </div>
        {/* Filings and news come from other sources; the page doesn't wait for them. */}
        <div className="mt-4 lg:mt-6">
          <Suspense fallback={null}>
            <StockNews symbol={stock.symbol} />
          </Suspense>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-6">
        <div style={{ animationDelay: "120ms" }} className="animate-fade-up">
          <Card aria-labelledby="range">
            <h2 id="range" className="text-lg font-semibold tracking-tight">
              52-week range
            </h2>
            <div className="mt-4">
              <RangeBar low={yearLow} high={yearHigh} current={stock.price} />
            </div>
          </Card>
        </div>

        <div style={{ animationDelay: "180ms" }} className="animate-fade-up">
          <TradeCard quote={quote} />
        </div>

        <div style={{ animationDelay: "240ms" }} className="flex flex-col gap-4 animate-fade-up lg:gap-6">
          <OpenOrders symbol={stock.symbol} />
          <PositionCard quote={quote} />
          <AlertCard symbol={stock.symbol} price={stock.price} />
        </div>
      </div>
    </div>
  );
}

/**
 * The stock exists, but its prices couldn't be loaded (the data source is
 * down or out of requests). This answer is only cached for a minute.
 */
function PricesUnavailable({ listing }: { listing: Listing }) {
  return (
    <Card aria-labelledby="stock-title" className="mt-4">
      <h1 id="stock-title" className="text-2xl font-semibold tracking-tight">
        {listing.symbol} <span className="font-normal text-muted">{listing.name}</span>
      </h1>
      <p className="mt-3 text-sm text-muted">Prices for {listing.symbol} are unavailable right now. Try again in a minute.</p>
      <div className="mt-3">
        <WatchToggle symbol={listing.symbol} />
      </div>
    </Card>
  );
}

/** Grey blocks in the shape of the page, shown while <StockDetails> loads. */
function StockDetailsSkeleton() {
  const block = "animate-pulse rounded-lg bg-foreground/[0.06]";
  return (
    <div aria-busy className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <span className="sr-only">Loading stock…</span>
      <Card className="lg:col-span-8">
        <div className={`h-8 w-56 ${block}`} />
        <div className={`mt-6 h-12 w-40 ${block}`} />
        <div className={`mt-6 h-56 sm:h-72 ${block}`} />
        <div className={`mt-6 h-10 ${block}`} />
      </Card>
      <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-6">
        <Card>
          <div className={`h-6 w-32 ${block}`} />
          <div className={`mt-4 h-14 ${block}`} />
        </Card>
        <Card>
          <div className={`h-6 w-32 ${block}`} />
          <div className={`mt-4 h-56 ${block}`} />
        </Card>
        <Card>
          <div className={`h-6 w-32 ${block}`} />
          <div className={`mt-4 h-32 ${block}`} />
        </Card>
      </div>
    </div>
  );
}

function AnalysisSkeleton() {
  const block = "animate-pulse rounded-lg bg-foreground/[0.06]";
  return (
    <Card aria-busy>
      <span className="sr-only">Loading risk and technicals…</span>
      <div className={`h-6 w-24 ${block}`} />
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`h-10 ${block}`} />
        ))}
      </div>
    </Card>
  );
}
