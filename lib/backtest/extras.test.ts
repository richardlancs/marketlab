import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseExtras } from "./extras";

// The measures themselves are the analytics service's (services/analytics/tests/test_analysis.py); here, one of its cases.
const fixture = JSON.parse(readFileSync(join(__dirname, "../../services/analytics/tests/fixtures/analysis.json"), "utf8")) as { cases: { analysis: unknown; periods: unknown }[] };
const extras = { analysis: fixture.cases[0].analysis, periods: fixture.cases[0].periods };

describe("result extras from the analytics service", () => {
  it("are checked field by field", () => {
    expect(parseExtras(extras)).toEqual(extras);
    expect(parseExtras({ ...extras, analysis: { ...(extras.analysis as object), roundTrips: 1.5 } })).toBeNull();
    expect(parseExtras({ analysis: extras.analysis })).toBeNull();
    expect(parseExtras(null)).toBeNull();
  });
});
