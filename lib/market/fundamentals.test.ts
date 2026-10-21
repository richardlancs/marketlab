import { describe, expect, it } from "vitest";
import { isCurrent, parseCompanyFacts, ratiosOf, type CompanyFacts } from "./fundamentals";

type Raw = { start?: string; end: string; val: number; filed?: string; form?: string };
const fact = ({ start, end, val, filed = "2026-01-01", form = "10-K" }: Raw) => ({ ...(start ? { start } : {}), end, val, filed, form, accn: "x", fy: 2025, fp: "FY" });
const usd = (...facts: Raw[]) => ({ units: { USD: facts.map(fact) } });

/** Calendar fiscal years 2023-2025, plus 2026's first half reported year-to-date in 10-Qs. */
function company(extra: Record<string, unknown> = {}) {
  const year = (y: number, val: number, filed = `${y + 1}-02-01`): Raw => ({ start: `${y}-01-01`, end: `${y}-12-31`, val, filed });
  return {
    cik: 42,
    entityName: "Example Corp",
    facts: {
      "us-gaap": {
        // An old tag with old years only, and the current one: the current one wins.
        SalesRevenueNet: usd(year(2023, 999)),
        Revenues: usd(
          year(2023, 80),
          year(2024, 90, "2025-02-01"),
          { ...year(2024, 100), filed: "2026-02-01" }, // restated in the next 10-K
          year(2025, 120),
          { start: "2025-01-01", end: "2025-09-30", val: 87, form: "10-Q" },
          { start: "2025-01-01", end: "2025-06-30", val: 57, form: "10-Q" },
          { start: "2025-01-01", end: "2025-03-31", val: 27, form: "10-Q" },
          { start: "2026-01-01", end: "2026-03-31", val: 33, form: "10-Q", filed: "2026-05-01" },
          { start: "2026-01-01", end: "2026-06-30", val: 68, form: "10-Q", filed: "2026-08-01" },
          { start: "2026-01-01", end: "2026-06-30", val: 1, form: "8-K", filed: "2026-08-02" }, // not a report
        ),
        CostOfRevenue: usd(year(2025, 72)),
        NetIncomeLoss: usd(year(2023, 8), year(2024, 10), year(2025, 15), { start: "2025-01-01", end: "2025-06-30", val: 7, form: "10-Q" }, { start: "2025-04-01", end: "2025-06-30", val: 4, form: "10-Q" }, { start: "2025-01-01", end: "2025-03-31", val: 3, form: "10-Q" }, { start: "2025-07-01", end: "2025-09-30", val: 4, form: "10-Q" }, { start: "2026-01-01", end: "2026-03-31", val: 5, form: "10-Q" }, { start: "2026-04-01", end: "2026-06-30", val: 5, form: "10-Q" }),
        EarningsPerShareDiluted: { units: { "USD/shares": [year(2024, 1), year(2025, 1.5)].map(fact) } },
        WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [year(2025, 10)].map(fact) } },
        StockholdersEquity: usd({ end: "2025-12-31", val: 60 }, { end: "2024-12-31", val: 50 }),
        NetCashProvidedByUsedInOperatingActivities: usd(year(2025, 20)),
        PaymentsToAcquirePropertyPlantAndEquipment: usd(year(2025, 5)),
        ...extra,
      },
    },
  };
}

describe("parseCompanyFacts", () => {
  const facts = parseCompanyFacts(company())!;

  it("reads fiscal years from the current tag, with restatements, oldest first", () => {
    expect(facts).toMatchObject({ cik: 42, name: "Example Corp", filed: "2026-08-01" });
    expect(facts.years.map((y) => [y.end, y.revenue])).toEqual([
      ["2023-12-31", 80],
      ["2024-12-31", 100],
      ["2025-12-31", 120],
    ]);
    expect(facts.years[2]).toMatchObject({ grossProfit: 48, netIncome: 15, eps: 1.5, dilutedShares: 10, equity: 60, operatingCashFlow: 20, capitalSpending: 5, freeCashFlow: 15 });
    expect(facts.years[0]).toMatchObject({ grossProfit: null, operatingIncome: null, eps: null, freeCashFlow: null });
  });

  it("adds up the last four quarters, working out ones reported only year to date", () => {
    // Revenue: Q3 2025 = 87 − 57, Q4 = 120 − 87, Q1 2026 = 33, Q2 = 68 − 33.
    expect(facts.trailing).toMatchObject({ end: "2026-06-30", revenue: 30 + 33 + 33 + 35, netIncome: 4 + (15 - 11) + 5 + 5 });
    // Not every line has quarters: those are unknown rather than a fiscal year's figure.
    expect(facts.trailing).toMatchObject({ grossProfit: null, eps: null });
  });

  it("uses the last fiscal year when no quarters follow it", () => {
    const data = company();
    const revenues = data.facts["us-gaap"].Revenues as { units: { USD: { form: string }[] } };
    revenues.units.USD = revenues.units.USD.filter((f) => f.form === "10-K");
    expect(parseCompanyFacts(data)!.trailing).toEqual({ end: "2025-12-31", revenue: 120, grossProfit: 48, operatingIncome: null, netIncome: 15, eps: 1.5 });
  });

  it("keeps the last five years", () => {
    const years = Array.from({ length: 8 }, (_, i) => ({ start: `${2018 + i}-01-01`, end: `${2018 + i}-12-31`, val: i }));
    const parsed = parseCompanyFacts({ cik: 1, entityName: "X", facts: { "us-gaap": { Revenues: usd(...years) } } })!;
    expect(parsed.years.map((y) => y.end.slice(0, 4))).toEqual(["2021", "2022", "2023", "2024", "2025"]);
  });

  it("picks the larger of two equally current tags, as one may be a part", () => {
    const y = (val: number) => ({ start: "2025-01-01", end: "2025-12-31", val });
    const data = { cik: 1, entityName: "Towers", facts: { "us-gaap": { RevenueFromContractWithCustomerExcludingAssessedTax: usd(y(1)), Revenues: usd(y(10)) } } };
    expect(parseCompanyFacts(data)!.years[0].revenue).toBe(10);
  });

  it("calls numbers current while the latest period is under 15 months old", () => {
    expect(isCurrent(facts, Date.parse("2027-06-01"))).toBe(true);
    expect(isCurrent(facts, Date.parse("2027-11-01"))).toBe(false);
  });

  it("reads foreign filers' IFRS tags, but only in dollars", () => {
    const ifrs = (unit: string) => ({ cik: 7, entityName: "Abroad", facts: { "ifrs-full": { Revenue: { units: { [unit]: [fact({ start: "2025-01-01", end: "2025-12-31", val: 50, form: "20-F" })] } } } } });
    expect(parseCompanyFacts(ifrs("USD"))!.years[0]).toMatchObject({ revenue: 50 });
    expect(parseCompanyFacts(ifrs("TWD"))).toBeNull();
    expect(parseCompanyFacts({ facts: {} })).toBeNull();
    expect(parseCompanyFacts(null)).toBeNull();
  });
});

describe("ratiosOf", () => {
  const facts = parseCompanyFacts(company())!;

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
