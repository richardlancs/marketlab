import { describe, expect, it } from "vitest";
import { sectorAllocation } from "./allocation";
import { tradesToCsv } from "./csv";
import { summarizePortfolio } from "./portfolio";
import type { Trade } from "./trading";

describe("tradesToCsv", () => {
  const trade: Trade = { id: "1", symbol: "AAPL", side: "sell", shares: 2, price: 100.5, time: Date.UTC(2026, 9, 16, 21, 5), realizedGain: -12.25 };

  it("writes a header and one row per trade, with ISO dates", () => {
    expect(tradesToCsv([trade])).toBe("Date,Time (UTC),Symbol,Side,Shares,Price,Total,Realized gain,Reason,Note,Option\r\n2026-10-16,21:05:00,AAPL,sell,2,100.5,201,-12.25,,,\r\n");
  });

  it("leaves the gain empty for buys, and writes only a header with no trades", () => {
    expect(tradesToCsv([{ ...trade, side: "buy", realizedGain: undefined }]).split("\r\n")[1].endsWith(",,,,")).toBe(true);
    expect(tradesToCsv([])).toBe("Date,Time (UTC),Symbol,Side,Shares,Price,Total,Realized gain,Reason,Note,Option\r\n");
  });

  it("writes the reason and note, quoting and defusing the note", () => {
    const row = tradesToCsv([{ ...trade, reason: "dip", note: '=1+1, "cheap"' }]).split("\r\n")[1];
    expect(row.endsWith(`,dip,"'=1+1, ""cheap""",`)).toBe(true);
  });

  it("includes dividends and splits, newest first", () => {
    const rows = tradesToCsv([trade], [{ id: "d", kind: "dividend", symbol: "AAPL", time: Date.UTC(2026, 9, 20, 20), shares: 2, value: 0.25, cash: 0.5 }]).split("\r\n");
    expect(rows[1]).toBe("2026-10-20,20:00:00,AAPL,dividend,2,0.25,0.5,,,,");
    expect(rows[2]).toContain(",sell,");
  });

  it("quotes and guards text a spreadsheet could misread, but not negative numbers", () => {
    const row = tradesToCsv([{ ...trade, symbol: '=HYPERLINK("x"),1' }]).split("\r\n")[1];
    expect(row).toContain(`"'=HYPERLINK(""x""),1"`);
    expect(row).toContain(",-12.25");
  });
});

describe("tradesToCsv: options", () => {
  it("names the contract and counts 100 shares a contract in the total", () => {
    const row = tradesToCsv([{ id: "o", symbol: "KO", side: "buy", shares: 2, price: 1.25, time: Date.UTC(2026, 9, 16, 21), option: { kind: "call", strike: 70, expiry: Date.UTC(2026, 11, 18, 12) } }]).split("\r\n")[1];
    expect(row).toBe("2026-10-16,21:00:00,KO,buy,2,1.25,250,,,,call 70 2026-12-18");
  });
});

describe("sectorAllocation", () => {
  const quote = (symbol: string, price: number) => ({ symbol, name: symbol, price, change: 0 });
  const sectors: Record<string, string> = { A: "Tech", B: "Tech", C: "Energy", D: "Health", E: "Retail", F: "Banks", G: "Media" };

  it("groups by sector with cash, and the shares add up to 1", () => {
    const summary = summarizePortfolio([{ symbol: "A", shares: 1, averageCost: 1 }, { symbol: "B", shares: 1, averageCost: 1 }, { symbol: "C", shares: 1, averageCost: 1 }], [quote("A", 30), quote("B", 20), quote("C", 25)], 25);
    const segments = sectorAllocation(summary, (s) => sectors[s]);
    expect(segments.map((s) => [s.label, s.value])).toEqual([["Tech", 50], ["Energy", 25], ["Cash", 25]]);
    expect(segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
  });

  it("folds the smallest sectors into Other past five groups, and counts unknown sectors", () => {
    const symbols = ["A", "C", "D", "E", "F", "G", "ZZ"];
    const summary = summarizePortfolio(symbols.map((symbol) => ({ symbol, shares: 1, averageCost: 1 })), symbols.map((s, i) => quote(s, 70 - i * 10)), 0);
    const segments = sectorAllocation(summary, (s) => sectors[s]);
    expect(segments.map((s) => s.label)).toEqual(["Tech", "Energy", "Health", "Retail", "Other (3 sectors)", "Cash"]);
    expect(segments.find((s) => s.key === "other")?.color).toBeNull();
  });

  it("keeps a sector's color when another grows past it", () => {
    const holdings = [{ symbol: "A", shares: 1, averageCost: 1 }, { symbol: "C", shares: 1, averageCost: 1 }];
    const before = sectorAllocation(summarizePortfolio(holdings, [quote("A", 10), quote("C", 5)], 0), (s) => sectors[s]);
    const after = sectorAllocation(summarizePortfolio(holdings, [quote("A", 5), quote("C", 10)], 0), (s) => sectors[s]);
    const colorOf = (segments: typeof before, key: string) => segments.find((s) => s.key === key)?.color;
    expect(colorOf(after, "Tech")).toBe(colorOf(before, "Tech"));
  });

  it("takes a short off the cash and adds options, so the shares still add up to 1", () => {
    // Long A worth 50, short C worth −20 (its proceeds are in the 70 cash), and a call worth 10: total 110.
    const summary = summarizePortfolio(
      [{ symbol: "A", shares: 1, averageCost: 40 }, { symbol: "C", shares: -1, averageCost: 25 }],
      [quote("A", 50), quote("C", 20)],
      70,
      [{ id: "o", symbol: "A", kind: "call", strike: 45, expiry: 1, contracts: 1, averagePremium: 0.08, mark: 0.1 }],
    );
    expect(summary.totalValue).toBeCloseTo(110);
    expect(summary.positions[1].gainPercent).toBeCloseTo(0.2); // the short fell from 25 to 20
    const segments = sectorAllocation(summary, (s) => sectors[s]);
    expect(segments.map((s) => [s.label, s.value])).toEqual([["Tech", 50], ["Options", 10], ["Cash, less shorts", 50]]);
    expect(segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
  });

  it("handles a cash-only account", () => {
    expect(sectorAllocation(summarizePortfolio([], [], 100), () => null)).toEqual([{ key: "cash", label: "Cash", value: 100, share: 1, color: null }]);
  });
});
