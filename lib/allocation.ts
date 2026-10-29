/**
 * The portfolio grouped for a part-to-whole chart: by holding or by sector,
 * with cash. Pure, so the grouping is unit-tested.
 */
import type { PortfolioSummary } from "./types";

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** Fraction of the total, 0..1. */
  share: number;
  /** Which categorical color to use (0-based), or null for the neutral gray of cash and "Other". */
  color: number | null;
}

/** Five categorical colors exist; with more groups, the smallest fold into "Other" rather than reusing one. */
export const MAX_NAMED = 4;

/**
 * Value by sector, largest first, then "Other" and cash. A stock without a
 * known sector (a ticker outside the catalog) counts as "Unknown sector".
 * Colors follow the sector's name, not its size, so a sector keeps its color
 * when another one grows past it.
 */
export function sectorAllocation(summary: PortfolioSummary, sectorOf: (symbol: string) => string | null | undefined): Segment[] {
  const bySector = new Map<string, number>();
  // Stocks owned by sector; a short is a debt, so it comes off the cash (which holds its proceeds) instead.
  for (const p of summary.positions.filter((x) => x.marketValue > 0)) {
    const sector = sectorOf(p.symbol) ?? "Unknown sector";
    bySector.set(sector, (bySector.get(sector) ?? 0) + p.marketValue);
  }
  const total = summary.totalValue;
  const share = (value: number) => (total > 0 ? value / total : 0);
  const sorted = [...bySector].sort((a, b) => b[1] - a[1]);
  const named = sorted.length > MAX_NAMED + 1 ? sorted.slice(0, MAX_NAMED) : sorted;
  const rest = sorted.slice(named.length);
  // Colors in alphabetical order of the named sectors: stable while the same sectors are shown.
  const colorOrder = named.map(([s]) => s).sort();

  const segments: Segment[] = named.map(([sector, value]) => ({ key: sector, label: sector, value, share: share(value), color: colorOrder.indexOf(sector) }));
  if (rest.length) {
    const value = rest.reduce((sum, [, v]) => sum + v, 0);
    segments.push({ key: "other", label: `Other (${rest.length} sectors)`, value, share: share(value), color: null });
  }
  if (summary.optionsValue > 0) segments.push({ key: "options", label: "Options", value: summary.optionsValue, share: share(summary.optionsValue), color: null });
  const shorts = summary.positions.reduce((sum, p) => (p.marketValue < 0 ? sum + p.marketValue : sum), 0) + Math.min(0, summary.optionsValue);
  const cash = Math.max(0, summary.cash + shorts);
  segments.push({ key: "cash", label: shorts < 0 ? "Cash, less shorts" : "Cash", value: cash, share: share(cash), color: null });
  return segments;
}
