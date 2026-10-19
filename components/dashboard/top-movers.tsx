import { Card } from "@/components/ui/card";
import { getTopMovers } from "@/lib/mock-data";
import type { Stock } from "@/lib/types";
import { StockRow } from "./stock-row";

/** Today's biggest percentage gainers and losers, side by side. */
export async function TopMovers() {
  const { gainers, losers } = await getTopMovers(3);

  return (
    <Card aria-labelledby="top-movers" className="h-full">
      <h2 id="top-movers" className="text-lg font-semibold tracking-tight">
        Top movers
      </h2>

      <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <MoverList title="Gainers" stocks={gainers} />
        <MoverList title="Losers" stocks={losers} />
      </div>
    </Card>
  );
}

function MoverList({ title, stocks }: { title: string; stocks: Stock[] }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h3>
      {stocks.length === 0 ? (
        <p className="py-3 text-sm text-muted">None today</p>
      ) : (
        <ul className="divide-y divide-border">
          {stocks.map((stock) => (
            <StockRow key={stock.symbol} stock={stock} />
          ))}
        </ul>
      )}
    </div>
  );
}
