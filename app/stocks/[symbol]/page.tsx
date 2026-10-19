import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PriceChart } from "@/components/charts/price-chart";
import { RangeBar } from "@/components/stocks/range-bar";
import { StockStats } from "@/components/stocks/stock-stats";
import { Card } from "@/components/ui/card";
import { ChangeBadge } from "@/components/ui/change-badge";
import { formatCurrency } from "@/lib/format";
import { getPortfolio, getStock, getStocks, getWatchlist } from "@/lib/mock-data";

/**
 * Tells Next.js which symbols exist, so it can build a page for each one ahead
 * of time (at `npm run build`). Other URLs, like /stocks/ZZZZ, still reach this
 * page at request time, where notFound() below turns them into a 404.
 */
export async function generateStaticParams() {
  const stocks = await getStocks();
  return stocks.map((stock) => ({ symbol: stock.symbol }));
}

// `params` is a Promise in this version of Next.js, so it's awaited.
// PageProps<"/stocks/[symbol]"> is a global type Next.js generates from the folder name.
export async function generateMetadata(props: PageProps<"/stocks/[symbol]">): Promise<Metadata> {
  const { symbol } = await props.params;
  const stock = await getStock(symbol.toUpperCase());
  return { title: stock ? `${stock.symbol} · ${stock.name} — MarketLab` : "Stock not found — MarketLab" };
}

/**
 * The page itself doesn't await `params`, so the parts that don't depend on the
 * symbol (the back link, the skeleton) form a shell that shows the moment a
 * link is clicked. Everything that needs the symbol is in <StockDetails>,
 * behind Suspense. For the ten symbols built ahead of time, the details are
 * already in the HTML, so the skeleton only shows during client navigation.
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
  const stock = await getStock(symbol);
  // Renders the nearest not-found.tsx. It throws, so nothing below runs.
  // proxy.ts already rejects unknown and lowercase symbols with real 404 and
  // 308 status codes before this page runs; this is a fallback.
  if (!stock) notFound();

  const [portfolio, watchlist] = await Promise.all([getPortfolio(), getWatchlist()]);
  const position = portfolio.positions.find((p) => p.symbol === stock.symbol);
  const watched = watchlist.some((s) => s.symbol === stock.symbol);

  // The 52-week range: daily closes for the past year, plus today's intraday extremes.
  const yearPrices = stock.history["1Y"].map((p) => p.price);
  const yearLow = Math.min(...yearPrices, stock.low);
  const yearHigh = Math.max(...yearPrices, stock.high);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div style={{ animationDelay: "60ms" }} className="animate-fade-up lg:col-span-8">
        <Card aria-labelledby="stock-title">
          <PriceChart
            history={stock.history}
            previousClose={stock.previousClose}
            title={
              <div className="min-w-0">
                <h1 id="stock-title" className="text-2xl font-semibold tracking-tight">
                  {stock.symbol} <span className="font-normal text-muted">{stock.name}</span>
                </h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  {stock.sector}
                  {watched && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">On your watchlist</span>
                  )}
                </p>
              </div>
            }
          />
          <StockStats stock={stock} className="mt-6" />
        </Card>
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
          <Card aria-labelledby="position">
            <h2 id="position" className="text-lg font-semibold tracking-tight">
              Your position
            </h2>
            {position ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Shares</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{position.shares}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Average cost</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{formatCurrency(position.averageCost)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Market value</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{formatCurrency(position.marketValue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Weight</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">
                    {((position.marketValue / portfolio.totalValue) * 100).toFixed(1)}%
                  </dd>
                </div>
                <div className="col-span-2 border-t border-border pt-3">
                  <dt className="text-xs text-muted">Today</dt>
                  <dd className="mt-0.5">
                    <ChangeBadge
                      change={position.dayChange}
                      // Today's % is measured against yesterday's value of the position.
                      percent={position.dayChange / (position.marketValue - position.dayChange)}
                      currency
                    />
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted">Total return</dt>
                  <dd className="mt-0.5">
                    <ChangeBadge change={position.gain} percent={position.gainPercent} currency />
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted">You don&apos;t own any {stock.symbol} in your simulated portfolio.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
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
          <div className={`mt-4 h-32 ${block}`} />
        </Card>
      </div>
    </div>
  );
}
