import { describe, expect, it } from "vitest";
import { divergingColor, periodReturns } from "./periods";

const at = (y: number, m: number, d: number, price: number) => ({ time: Date.UTC(y, m, d, 20), price });

describe("periodReturns", () => {
  const equity = [at(2025, 10, 10, 100), at(2025, 10, 28, 110), at(2025, 11, 15, 99), at(2025, 11, 31, 121), at(2026, 0, 30, 133.1)];
  const { months, years } = periodReturns(equity);

  it("measures each month from the previous month's end, the first from the start", () => {
    expect(months.map((m) => [m.year, m.month])).toEqual([[2025, 10], [2025, 11], [2026, 0]]);
    expect(months[0].value).toBeCloseTo(0.1);
    expect(months[1].value).toBeCloseTo(0.1);
    expect(months[2].value).toBeCloseTo(0.1);
    expect(months[0].partial).toBe(true);
  });

  it("compounds months into years, and marks years the run doesn't fully cover", () => {
    expect(years.map((y) => y.year)).toEqual([2025, 2026]);
    expect(years[0].value).toBeCloseTo(0.21);
    expect(years.every((y) => y.partial)).toBe(true);
  });

  it("handles a run within one month, and one too short to measure", () => {
    const short = periodReturns([at(2026, 3, 1, 100), at(2026, 3, 20, 90)]);
    expect(short.months).toHaveLength(1);
    expect(short.months[0].value).toBeCloseTo(-0.1);
    expect(periodReturns([at(2026, 3, 1, 100)])).toEqual({ months: [], years: [] });
  });
});

describe("divergingColor", () => {
  it("is the card color at zero, and strongest at the limit", () => {
    expect(divergingColor(0, 0.1)).toBe("var(--surface)");
    expect(divergingColor(0.1, 0.1)).toBe("color-mix(in oklab, var(--gain) 55%, var(--surface))");
    expect(divergingColor(-0.5, 0.1)).toBe("color-mix(in oklab, var(--loss) 55%, var(--surface))");
    expect(divergingColor(0.05, 0.1)).toContain("28%");
  });
});
