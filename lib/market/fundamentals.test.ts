import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isCompanyFacts, type CompanyFacts } from "./fundamentals";

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

});
