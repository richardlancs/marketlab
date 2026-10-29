import type { OptionPosition } from "./trading";
import type { Holding, PortfolioSummary, Position, Stock } from "./types";

/**
 * Values a set of holdings at current prices. Pure function: same inputs,
 * same output, no side effects, so it's easy to test and reuse later for
 * the portfolio simulator.
 */
export function summarizePortfolio(
  holdings: Holding[],
  stocks: Pick<Stock, "symbol" | "name" | "price" | "change">[],
  cash: number,
  options: OptionPosition[] = [],
): PortfolioSummary {
  const positions: Position[] = holdings.map((holding) => {
    // A stock with no price yet (still loading, or unavailable right now) is
    // valued at what it cost, with no change today, rather than breaking the
    // whole summary. `priced: false` lets the UI show "—" for it.
    const quote = stocks.find((s) => s.symbol === holding.symbol);
    const stock = quote ?? { symbol: holding.symbol, name: holding.symbol, price: holding.averageCost, change: 0 };

    const marketValue = holding.shares * stock.price;
    const costBasis = holding.shares * holding.averageCost;
    const gain = marketValue - costBasis;
    return {
      ...holding,
      name: stock.name,
      price: stock.price,
      marketValue,
      costBasis,
      gain,
      // Against what was put in (for a short, what it was sold for), so a short that fell shows a gain.
      gainPercent: costBasis === 0 ? 0 : gain / Math.abs(costBasis),
      dayChange: holding.shares * stock.change,
      priced: quote !== undefined,
    };
  });

  const sum = (pick: (p: Position) => number) => positions.reduce((total, p) => total + pick(p), 0);

  // Options at their latest mark from the analytics service, or what they cost until there's one.
  const optionsValue = options.reduce((total, o) => total + o.contracts * 100 * (o.mark ?? o.averagePremium), 0);
  const totalValue = cash + sum((p) => p.marketValue) + optionsValue;
  const costBasis = sum((p) => Math.abs(p.costBasis));
  const totalGain = sum((p) => p.gain);
  const dayChange = sum((p) => p.dayChange);
  // Today's percentage is measured against yesterday's value, not today's.
  const previousValue = totalValue - dayChange;

  return {
    cash,
    positions,
    optionsValue,
    totalValue,
    costBasis,
    totalGain,
    totalGainPercent: costBasis === 0 ? 0 : totalGain / costBasis,
    dayChange,
    dayChangePercent: previousValue === 0 ? 0 : dayChange / previousValue,
  };
}
