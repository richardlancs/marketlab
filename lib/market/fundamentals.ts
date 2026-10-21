/**
 * Company numbers from the SEC's "company facts" API
 * (data.sec.gov/api/xbrl/companyfacts/CIK##########.json): what each company
 * reported in its 10-K and 10-Q filings, tagged in XBRL. They're public
 * records, so unlike licensed price data they can be shown on the public site,
 * next to simulated prices.
 *
 * Companies tag the same idea in different ways (Apple's revenue is
 * "RevenueFromContractWithCustomerExcludingAssessedTax", JPMorgan's is
 * "RevenuesNetOfInterestExpense"), so each line tries a list of tags. Only US
 * dollar amounts are read: a company reporting in another currency has no
 * numbers here rather than misleading ones.
 *
 * Parsing and ratios are here, pure and tested; fetching and storing are
 * lib/fundamentals.ts (server only).
 */

/** One reporting period's income statement. Amounts in dollars; null where the company didn't report it. */
export interface Period {
  /** The period's last day, YYYY-MM-DD. */
  end: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  /** Diluted earnings per share. */
  eps: number | null;
}

export interface FiscalYear extends Period {
  start: string;
  /** Weighted average diluted shares over the year. */
  dilutedShares: number | null;
  /** Shareholders' equity at the year's end. */
  equity: number | null;
  operatingCashFlow: number | null;
  capitalSpending: number | null;
  /** Operating cash flow less capital spending. */
  freeCashFlow: number | null;
}

export interface CompanyFacts {
  cik: number;
  name: string;
  /** Up to the last five fiscal years, oldest first. */
  years: FiscalYear[];
  /** The last four quarters added up, when the company has reported quarters since its last fiscal year; otherwise the last fiscal year. */
  trailing: Period | null;
  /** When the newest filing used here was filed, YYYY-MM-DD. */
  filed: string;
}

type Taxonomy = "us-gaap" | "ifrs-full";
type Concepts = Partial<Record<Taxonomy, string[]>>;

const REVENUE: Concepts = {
  "us-gaap": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenuesNetOfInterestExpense", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
  "ifrs-full": ["Revenue", "RevenueFromContractsWithCustomers"],
};
const COST_OF_REVENUE: Concepts = { "us-gaap": ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"], "ifrs-full": ["CostOfSales"] };
const GROSS_PROFIT: Concepts = { "us-gaap": ["GrossProfit"], "ifrs-full": ["GrossProfit"] };
const OPERATING_INCOME: Concepts = { "us-gaap": ["OperatingIncomeLoss"], "ifrs-full": ["ProfitLossFromOperatingActivities"] };
const NET_INCOME: Concepts = {
  "us-gaap": ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"],
  "ifrs-full": ["ProfitLossAttributableToOwnersOfParent", "ProfitLoss"],
};
const EPS: Concepts = { "us-gaap": ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"], "ifrs-full": ["DilutedEarningsLossPerShare", "BasicEarningsLossPerShare"] };
const DILUTED_SHARES: Concepts = { "us-gaap": ["WeightedAverageNumberOfDilutedSharesOutstanding"], "ifrs-full": ["AdjustedWeightedAverageShares"] };
const EQUITY: Concepts = { "us-gaap": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], "ifrs-full": ["EquityAttributableToOwnersOfParent", "Equity"] };
const OPERATING_CASH_FLOW: Concepts = {
  "us-gaap": ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  "ifrs-full": ["CashFlowsFromUsedInOperatingActivities"],
};
const CAPITAL_SPENDING: Concepts = {
  "us-gaap": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  "ifrs-full": ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
};

/** Annual and quarterly reports, US and foreign, with amendments. */
const FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const YEARS = 5;
const DAY = 86_400_000;

interface Fact {
  start?: string;
  end: string;
  val: number;
  filed: string;
}

const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY;
const isYear = (f: Fact) => f.start !== undefined && days(f.start, f.end) >= 350 && days(f.start, f.end) <= 380;
const isQuarter = (length: number) => length >= 80 && length <= 100;

/** A tag's well-formed facts in `unit`, from the forms above; a period reported twice keeps its latest filing (a restatement). */
function factsOf(taxonomy: Record<string, unknown> | undefined, concept: string, unit: string): Fact[] {
  const units = (taxonomy?.[concept] as { units?: Record<string, unknown> } | undefined)?.units;
  const list = units?.[unit];
  if (!Array.isArray(list)) return [];
  const byPeriod = new Map<string, Fact>();
  for (const raw of list as Record<string, unknown>[]) {
    const { start, end, val, filed, form } = raw ?? {};
    if (typeof end !== "string" || typeof val !== "number" || !Number.isFinite(val) || typeof filed !== "string" || typeof form !== "string" || !FORMS.has(form)) continue;
    if (start !== undefined && typeof start !== "string") continue;
    const key = `${start ?? ""}|${end}`;
    const seen = byPeriod.get(key);
    if (!seen || filed > seen.filed) byPeriod.set(key, { start: start as string | undefined, end, val, filed });
  }
  return [...byPeriod.values()];
}

/**
 * Quarter values by their last day. Reported three-month periods are used as
 * they are; others come from differences, as companies often report only
 * year-to-date figures (and no fourth quarter at all): nine months less six,
 * or the full year less nine months.
 */
function quartersOf(facts: Fact[]): Map<string, number> {
  const quarters = new Map<string, number>();
  const durations = facts.filter((f) => f.start !== undefined);
  for (const f of durations) if (isQuarter(days(f.start!, f.end))) quarters.set(f.end, f.val);
  const byStart = new Map<string, Fact[]>();
  for (const f of durations) byStart.set(f.start!, [...(byStart.get(f.start!) ?? []), f]);
  for (const f of durations) {
    if (days(f.start!, f.end) <= 100 || quarters.has(f.end)) continue;
    const shorter = byStart.get(f.start!)!.find((g) => isQuarter(days(g.end, f.end)));
    if (shorter) quarters.set(f.end, f.val - shorter.val);
  }
  // A fourth quarter without nine months to subtract: the year less its other three quarters.
  for (const f of durations) {
    if (!isYear(f) || quarters.has(f.end)) continue;
    const inside = [...quarters].filter(([end]) => end > f.start! && end < f.end);
    if (inside.length === 3) quarters.set(f.end, inside.reduce((rest, [, value]) => rest - value, f.val));
  }
  return quarters;
}

interface Line {
  years: Map<string, Fact>;
  quarters: Map<string, number>;
  /** Point-in-time values (balance sheet), by date. */
  instants: Map<string, number>;
  filed: string;
}

/**
 * One line of the statements, from the first tag that has a value for each
 * period. `prefer` puts the tag with the most recent data first, so a
 * company that switched tags years ago reads its current one.
 */
function lineOf(taxonomy: Record<string, unknown>, concepts: string[], unit: string, prefer = false): Line {
  const perConcept = concepts.map((c) => factsOf(taxonomy, c, unit)).filter((facts) => facts.length > 0);
  if (prefer) {
    const latest = (facts: Fact[]) => facts.reduce((m, f) => (f.end > m ? f.end : m), "");
    const lastYear = (facts: Fact[]) => facts.filter(isYear).reduce<Fact | null>((m, f) => (!m || f.end > m.end ? f : m), null)?.val ?? 0;
    // Equally recent tags: the larger one, as a company may also tag a part
    // (American Tower's revenue from contracts leaves out its tower leases).
    perConcept.sort((a, b) => (latest(b) > latest(a) ? 1 : latest(b) < latest(a) ? -1 : lastYear(b) - lastYear(a)));
  }
  const line: Line = { years: new Map(), quarters: new Map(), instants: new Map(), filed: "" };
  for (const facts of perConcept) {
    for (const f of facts) {
      if (f.filed > line.filed) line.filed = f.filed;
      if (f.start === undefined) {
        if (!line.instants.has(f.end)) line.instants.set(f.end, f.val);
      } else if (isYear(f) && !line.years.has(f.end)) line.years.set(f.end, f);
    }
    for (const [end, value] of quartersOf(facts)) if (!line.quarters.has(end)) line.quarters.set(end, value);
  }
  return line;
}

const yearValue = (line: Line, end: string) => line.years.get(end)?.val ?? null;
const round = (v: number | null) => (v === null ? null : Math.round(v * 1e4) / 1e4);
const difference = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

/** The company's numbers, or null if it reports none in US dollars (no revenue or earnings found). */
export function parseCompanyFacts(data: unknown): CompanyFacts | null {
  if (typeof data !== "object" || data === null) return null;
  const { cik, entityName, facts } = data as { cik?: unknown; entityName?: unknown; facts?: Record<string, Record<string, unknown>> };
  if (!facts) return null;
  const taxonomy: Taxonomy = facts["us-gaap"] ? "us-gaap" : "ifrs-full";
  const tags = facts[taxonomy];
  if (!tags) return null;
  const of = (concepts: Concepts, unit = "USD", prefer = false) => lineOf(tags, concepts[taxonomy] ?? [], unit, prefer);

  const revenue = of(REVENUE, "USD", true);
  const netIncome = of(NET_INCOME);
  const anchor = revenue.years.size > 0 ? revenue : netIncome;
  if (anchor.years.size === 0) return null;
  const cost = of(COST_OF_REVENUE);
  const grossProfit = of(GROSS_PROFIT);
  const operatingIncome = of(OPERATING_INCOME);
  const eps = of(EPS, "USD/shares");
  const shares = of(DILUTED_SHARES, "shares");
  const equity = of(EQUITY);
  const cashFlow = of(OPERATING_CASH_FLOW);
  const capex = of(CAPITAL_SPENDING);

  const gross = (rev: number | null, reported: number | null, costs: number | null) => reported ?? difference(rev, costs);
  const years: FiscalYear[] = [...anchor.years.values()]
    .sort((a, b) => a.end.localeCompare(b.end))
    .slice(-YEARS)
    .map(({ start, end }) => {
      const rev = yearValue(revenue, end);
      const ocf = yearValue(cashFlow, end);
      const spent = yearValue(capex, end);
      return {
        start: start!,
        end,
        revenue: rev,
        grossProfit: gross(rev, yearValue(grossProfit, end), yearValue(cost, end)),
        operatingIncome: yearValue(operatingIncome, end),
        netIncome: yearValue(netIncome, end),
        eps: yearValue(eps, end),
        dilutedShares: yearValue(shares, end),
        equity: equity.instants.get(end) ?? null,
        operatingCashFlow: ocf,
        capitalSpending: spent,
        freeCashFlow: difference(ocf, spent),
      };
    });

  const filed = [revenue, netIncome, eps, equity, cashFlow].reduce((m, l) => (l.filed > m ? l.filed : m), "");
  return { cik: typeof cik === "number" ? cik : Number(cik) || 0, name: typeof entityName === "string" ? entityName : "", years, trailing: trailingOf(years.at(-1)!, anchor, { revenue, grossProfit, cost, operatingIncome, netIncome, eps }), filed };
}

/** The last four quarters, if they run on from each other and end after the last fiscal year; otherwise that year. */
function trailingOf(lastYear: FiscalYear, anchor: Line, lines: Record<"revenue" | "grossProfit" | "cost" | "operatingIncome" | "netIncome" | "eps", Line>): Period {
  const yearOnly: Period = { end: lastYear.end, revenue: lastYear.revenue, grossProfit: lastYear.grossProfit, operatingIncome: lastYear.operatingIncome, netIncome: lastYear.netIncome, eps: lastYear.eps };
  const ends = [...anchor.quarters.keys()].sort().slice(-4);
  if (ends.length < 4 || ends[3] <= lastYear.end) return yearOnly;
  for (let i = 1; i < 4; i++) if (days(ends[i - 1], ends[i]) < 75 || days(ends[i - 1], ends[i]) > 105) return yearOnly;
  const sum = (line: Line) => {
    let total = 0;
    for (const end of ends) {
      const value = line.quarters.get(end);
      if (value === undefined) return null;
      total += value;
    }
    return total;
  };
  const revenue = sum(lines.revenue);
  return {
    end: ends[3],
    revenue,
    grossProfit: sum(lines.grossProfit) ?? difference(revenue, sum(lines.cost)),
    operatingIncome: sum(lines.operatingIncome),
    netIncome: sum(lines.netIncome),
    // Quarterly figures are in cents, so the sum is too (without float noise like 8.709999).
    eps: round(sum(lines.eps)),
  };
}

/** Numbers this old (by their latest period) are left out of comparisons: the company has stopped reporting in dollars, or at all. */
const CURRENT_FOR = 15 * 31 * DAY;
export const isCurrent = (facts: CompanyFacts, now: number) => Date.parse(facts.trailing?.end ?? facts.years.at(-1)?.end ?? "") > now - CURRENT_FOR;

export interface Ratios {
  /** Last fiscal year's revenue against the year before. */
  revenueGrowth: number | null;
  /** Last fiscal year's earnings per share against the year before (null when the earlier year lost money). */
  epsGrowth: number | null;
  /** Of revenue, over the trailing four quarters. */
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  /** Last fiscal year's earnings over its year-end equity (null when equity is negative). */
  returnOnEquity: number | null;
  /** Market value over trailing earnings, or the price over trailing earnings per share without one (null when there are no earnings). */
  peRatio: number | null;
  /** Market value over trailing revenue. */
  priceToSales: number | null;
  /** Last fiscal year's free cash flow over the market value. */
  freeCashFlowYield: number | null;
}

const ratio = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : a / b);
const growth = (now: number | null | undefined, before: number | null | undefined) => (now == null || before == null || before <= 0 ? null : now / before - 1);

/** Ratios from the reported numbers and today's price. Without a market value, it's the price times the diluted shares. */
export function ratiosOf(facts: CompanyFacts, price: number, marketCap: number | null): Ratios {
  const last = facts.years.at(-1);
  const before = facts.years.at(-2);
  const t = facts.trailing;
  const value = marketCap ?? (last?.dilutedShares ? price * last.dilutedShares : null);
  return {
    revenueGrowth: growth(last?.revenue, before?.revenue),
    epsGrowth: growth(last?.eps, before?.eps),
    grossMargin: ratio(t?.grossProfit, t?.revenue),
    operatingMargin: ratio(t?.operatingIncome, t?.revenue),
    netMargin: ratio(t?.netIncome, t?.revenue),
    returnOnEquity: last?.equity && last.equity > 0 ? ratio(last.netIncome, last.equity) : null,
    // By value rather than per share where possible: per-share figures don't
    // match the traded share for depositary receipts (TSM) or share classes (BRK-B).
    peRatio: marketCap !== null ? (t?.netIncome && t.netIncome > 0 ? marketCap / t.netIncome : null) : t?.eps && t.eps > 0 ? price / t.eps : null,
    priceToSales: ratio(value, t?.revenue),
    freeCashFlowYield: ratio(last?.freeCashFlow, value),
  };
}
