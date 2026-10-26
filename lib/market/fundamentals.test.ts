import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isCompanyFacts, isCurrent, ratiosOf, type CompanyFacts } from "./fundamentals";

// Parsing is the analytics service's (services/analytics/tests/test_fundamentals.py);
// this is one of its fixed cases: Example Corp, years 2023-2025 and the four quarters to June 2026.
const fixture = JSON.parse(readFileSync(join(__dirname, "../../services/analytics/tests/fixtures/company-facts.json"), "utf8")) as { cases: { name: string; expected: CompanyFacts | null }[] };
const facts = fixture.cases.find((c) => c.name === "company")!.expected!;

describe("company facts from the analytics service", () => {
  it("are checked field by field", () => {
    expect(isCompanyFacts(facts)).toBe(true);
    expect(isCompanyFacts({ ...facts, years: [] })).toBe(false);
    expect(isCompanyFacts({ ...facts, trailing: { ...facts.trailing, revenue: "lots" } })).toBe(false);
    expect(isCompanyFacts({ ...facts, years: [{ ...facts.years[0], end: "last year" }] })).toBe(false);
    expect(isCompanyFacts(null)).toBe(false);
  });

  it("are current while the latest period is under 15 months old", () => {
    expect(isCurrent(facts, Date.parse("2027-06-01"))).toBe(true);
    expect(isCurrent(facts, Date.parse("2027-11-01"))).toBe(false);
  });
});

describe("ratiosOf", () => {

  it("works out growth, margins, returns and valuation", () => {
    const r = ratiosOf(facts, 30, 600);
    expect(r.revenueGrowth).toBeCloseTo(0.2);
    expect(r.epsGrowth).toBeCloseTo(0.5);
    expect(r.netMargin).toBeCloseTo(18 / 131);
    expect(r.grossMargin).toBeNull();
    expect(r.returnOnEquity).toBeCloseTo(15 / 60);
    expect(r.priceToSales).toBeCloseTo(600 / 131);
    expect(r.freeCashFlowYield).toBeCloseTo(15 / 600);
    // By value: market value over trailing earnings, so it works without earnings per share.
    expect(r.peRatio).toBeCloseTo(600 / 18);
  });

  it("values the company from its diluted shares without a market value, and skips meaningless ratios", () => {
    const losing: CompanyFacts = {
      ...facts,
      trailing: { ...facts.trailing!, eps: -2 },
      years: facts.years.map((y) => ({ ...y, equity: -5 })),
    };
    const r = ratiosOf(losing, 30, null);
    expect(r.priceToSales).toBeCloseTo(300 / 131);
    expect(r.peRatio).toBeNull();
    expect(r.returnOnEquity).toBeNull();
    expect(ratiosOf({ ...facts, trailing: { ...facts.trailing!, eps: 2 } }, 30, null).peRatio).toBe(15);
  });
});
