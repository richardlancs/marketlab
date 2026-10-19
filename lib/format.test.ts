import { describe, expect, it } from "vitest";
import {
  formatAxisValue,
  formatChange,
  formatCompactCurrency,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatShare,
  formatShortDate,
  formatSignedCurrency,
  formatTime,
} from "./format";

// Some ICU versions put a narrow no-break space before "AM"/"PM";
// normalize all whitespace so tests pass everywhere.
const plain = (s: string) => s.replace(/\s/g, " ");

describe("format", () => {
  it("formats currency", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCompactCurrency(2.89e12)).toBe("$2.89T");
    expect(formatCompactCurrency(456_700_000)).toBe("$456.7M");
  });

  it("formats plain and compact numbers", () => {
    expect(formatNumber(6712.4)).toBe("6,712.40");
    expect(formatCompactNumber(52_300_000)).toBe("52.3M");
  });

  it("signs changes", () => {
    expect(formatChange(3.2)).toBe("+3.20");
    expect(formatChange(-1.5)).toBe("-1.50");
    expect(formatChange(0)).toBe("0.00");
  });

  it("formats fractions as signed percentages", () => {
    expect(formatPercent(0.0123)).toBe("+1.23%");
    expect(formatPercent(-0.0005)).toBe("-0.05%");
    expect(formatPercent(0)).toBe("0.00%");
  });

  it("formats dates and times in New York time", () => {
    const marketOpen = Date.UTC(2026, 9, 16, 13, 30); // 9:30 AM EDT
    expect(formatDate(marketOpen)).toBe("Oct 16, 2026");
    expect(plain(formatTime(marketOpen))).toBe("9:30 AM");
    expect(formatShortDate(marketOpen)).toBe("Oct 16");
  });

  it("formats axis values without forced decimals", () => {
    expect(formatAxisValue(247.5)).toBe("247.5");
    expect(formatAxisValue(22600)).toBe("22,600");
  });

  it("formats signed currency for gains and losses", () => {
    expect(formatSignedCurrency(1234.5)).toBe("+$1,234.50");
    expect(formatSignedCurrency(-20)).toBe("-$20.00");
    expect(formatSignedCurrency(0)).toBe("$0.00");
  });

  it("formats unsigned shares", () => {
    expect(formatShare(0.25)).toBe("25.0%");
    expect(formatShare(0.0049)).toBe("0.5%");
  });
});
