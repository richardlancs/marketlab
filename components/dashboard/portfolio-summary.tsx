import { Card } from "@/components/ui/card";
import { ChangeBadge } from "@/components/ui/change-badge";
import { formatCurrency } from "@/lib/format";
import { getPortfolio } from "@/lib/mock-data";

const weightFormat = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

/**
 * Colors follow the holding, in the order the holdings are listed, never their
 * size. If one position grows past another, neither changes color.
 */
const seriesColor = (i: number) => `var(--series-${i + 1})`;
const CASH_COLOR = "color-mix(in srgb, var(--muted) 45%, transparent)";

/** The simulated portfolio: total value, today's and all-time change, and what it's made of. */
export async function PortfolioSummary() {
  const portfolio = await getPortfolio();

  // One entry per slice of the allocation bar and row of the table, cash last.
  const slices = [
    ...portfolio.positions.map((p, i) => ({
      label: p.symbol,
      name: p.name,
      value: p.marketValue,
      gain: p.gain,
      gainPercent: p.gainPercent,
      color: seriesColor(i),
    })),
    { label: "Cash", name: "Uninvested", value: portfolio.cash, gain: null, gainPercent: null, color: CASH_COLOR },
  ].map((slice) => ({ ...slice, weight: slice.value / portfolio.totalValue }));

  return (
    <Card aria-labelledby="portfolio" className="h-full">
      <div className="flex items-baseline justify-between">
        <h2 id="portfolio" className="text-lg font-semibold tracking-tight">
          Portfolio
        </h2>
        <span className="text-xs text-muted">Simulated · {portfolio.positions.length} positions</span>
      </div>

      <p className="mt-3 text-3xl font-semibold tracking-tight">{formatCurrency(portfolio.totalValue)}</p>
      <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5">
          <dt className="text-muted">Today</dt>
          <dd>
            <ChangeBadge change={portfolio.dayChange} percent={portfolio.dayChangePercent} currency />
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-muted">All time</dt>
          <dd>
            <ChangeBadge change={portfolio.totalGain} percent={portfolio.totalGainPercent} currency />
          </dd>
        </div>
      </dl>

      {/*
       * Allocation bar: one segment per slice, sized by its share of the total.
       * The 2px gap between segments keeps neighboring colors distinct. It's
       * hidden from screen readers because the table below has every number.
       */}
      <div aria-hidden className="mt-5 flex h-3 gap-0.5">
        {slices.map((slice) => (
          <div
            key={slice.label}
            title={`${slice.label}: ${formatCurrency(slice.value)} (${weightFormat.format(slice.weight)})`}
            className="rounded-[4px] transition-opacity hover:opacity-75"
            style={{ width: `${slice.weight * 100}%`, background: slice.color }}
          />
        ))}
      </div>

      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Holdings</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className="pb-1.5 text-left font-medium">
              Holding
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Value
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Weight
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Return
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border border-t border-border tabular-nums">
          {slices.map((slice) => (
            <tr key={slice.label}>
              <th scope="row" className="py-2 text-left font-medium">
                {/* The color key ties each row to its segment in the bar above. */}
                <span aria-hidden className="mr-2 inline-block size-2.5 rounded-[3px] align-middle" style={{ background: slice.color }} />
                <span title={slice.name}>{slice.label}</span>
              </th>
              <td className="py-2 text-right">{formatCurrency(slice.value)}</td>
              <td className="py-2 text-right text-muted">{weightFormat.format(slice.weight)}</td>
              <td className="py-2 text-right">
                {slice.gain === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <ChangeBadge change={slice.gain} percent={slice.gainPercent} variant="pill" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
