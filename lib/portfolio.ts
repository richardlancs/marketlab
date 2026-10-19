import type { Holding, PortfolioSummary, Position, Stock } from "./types";

/**
 * Values a set of holdings at current prices. Pure function: same inputs,
 * same output, no side effects, so it's easy to test and reuse later for
 * the portfolio simulator.
 */
export function summarizePortfolio(holdings: Holding[], stocks: Stock[], cash: number): PortfolioSummary {
  const positions: Position[] = holdings.map((holding) => {
    const stock = stocks.find((s) => s.symbol === holding.symbol);
    if (!stock) throw new Error(`Unknown symbol in portfolio: ${holding.symbol}`);

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
      gainPercent: costBasis === 0 ? 0 : gain / costBasis,
      dayChange: holding.shares * stock.change,
    };
  });

  const sum = (pick: (p: Position) => number) => positions.reduce((total, p) => total + pick(p), 0);

  const totalValue = cash + sum((p) => p.marketValue);
  const costBasis = sum((p) => p.costBasis);
  const totalGain = sum((p) => p.gain);
  const dayChange = sum((p) => p.dayChange);
  // Today's percentage is measured against yesterday's value, not today's.
  const previousValue = totalValue - dayChange;

  return {
    cash,
    positions,
    totalValue,
    costBasis,
    totalGain,
    totalGainPercent: costBasis === 0 ? 0 : totalGain / costBasis,
    dayChange,
    dayChangePercent: previousValue === 0 ? 0 : dayChange / previousValue,
  };
}
