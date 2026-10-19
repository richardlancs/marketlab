/**
 * Returns by calendar month and year, for the heatmap under a backtest's
 * results. Pure, so the arithmetic is unit-tested.
 */
import type { PricePoint } from "../types";

export interface MonthReturn {
  year: number;
  /** 0 = January. */
  month: number;
  value: number;
  /** True for the run's first or last month when it only covers part of it. */
  partial: boolean;
}

export interface YearReturn {
  year: number;
  value: number;
  partial: boolean;
}

/**
 * Each month's return: its last value over the previous month's last value,
 * minus 1. The first month is measured from the run's first day instead, so
 * it (and a last month that hasn't ended) is marked partial. A year compounds
 * its months: (1 + r1) × (1 + r2) × … − 1.
 */
export function periodReturns(equity: readonly PricePoint[]): { months: MonthReturn[]; years: YearReturn[] } {
  if (equity.length < 2) return { months: [], years: [] };
  const monthOf = (time: number) => {
    const d = new Date(time);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  };

  const months: MonthReturn[] = [];
  let base = equity[0].price;
  for (let i = 0; i < equity.length; i++) {
    const here = monthOf(equity[i].time);
    const nextPoint = equity[i + 1];
    const endsMonth = !nextPoint || monthOf(nextPoint.time).month !== here.month || monthOf(nextPoint.time).year !== here.year;
    if (!endsMonth) continue;
    // The first month starts on the run's first day, and the last may end before the month does.
    months.push({ ...here, value: equity[i].price / base - 1, partial: months.length === 0 || !nextPoint });
    base = equity[i].price;
  }

  const years: YearReturn[] = [];
  for (const m of months) {
    const year = years.at(-1);
    if (year && year.year === m.year) {
      year.value = (1 + year.value) * (1 + m.value) - 1;
      year.partial ||= m.partial;
    } else {
      years.push({ year: m.year, value: m.value, partial: m.partial });
    }
  }
  // A year the run doesn't cover from January to December is partial too.
  for (const y of years) if (months.filter((m) => m.year === y.year).length < 12) y.partial = true;
  return { months, years };
}

/**
 * A cell color for a signed value: green for gains, red for losses, mixed
 * with the card color by how big the value is (up to `maxAbs`, where the
 * color is strongest). Zero is the plain card color. Every cell also shows
 * its number with a sign, so the color is never the only way to read it.
 */
export function divergingColor(value: number, maxAbs: number): string {
  const strength = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const percent = Math.round(strength * 55); // capped so the number on top stays readable
  if (percent === 0) return "var(--surface)";
  return `color-mix(in oklab, var(${value > 0 ? "--gain" : "--loss"}) ${percent}%, var(--surface))`;
}
