import { connection } from "next/server";
import { FactorExposuresView } from "@/components/analytics/factor-exposures";
import { Card } from "@/components/ui/card";
import { getStockFactors } from "@/lib/analytics/server";

/**
 * What drives the stock: its exposures to the market, size, value, momentum
 * and low-volatility factors over the past year (lib/analytics/factors.ts),
 * calculated nightly by the analytics service. Streams in after the page.
 */
export async function StockFactors({ symbol }: { symbol: string }) {
  // At request time, like the risk card: a prerendered "unavailable" would be baked into the page.
  await connection();
  if (symbol === "SPX") return null;
  const result = await getStockFactors(symbol);
  return (
    <Card aria-labelledby="factors">
      <h2 id="factors" className="text-lg font-semibold tracking-tight">
        What drives it
      </h2>
      {result.status === "ok" ? (
        <div className="mt-3">
          <FactorExposuresView exposures={result.exposures} subject={symbol} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{result.reason}</p>
      )}
    </Card>
  );
}
