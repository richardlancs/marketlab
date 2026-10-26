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
 * The analytics service fetches and parses them
 * (services/analytics/analytics/fundamentals.py); lib/fundamentals.ts stores
 * them. The ratios that depend on today's price are worked out here, next to
 * the price.
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

const DAY = 86_400_000;
const isNumberOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const isDay = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const PERIOD_FIELDS = ["revenue", "grossProfit", "operatingIncome", "netIncome", "eps"] as const;
const YEAR_FIELDS = [...PERIOD_FIELDS, "dilutedShares", "equity", "operatingCashFlow", "capitalSpending", "freeCashFlow"] as const;

/** Checks what the analytics service sent back is the shape above, field by field, rather than trusting it. */
export function isCompanyFacts(value: unknown): value is CompanyFacts {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.cik !== "number" || typeof v.name !== "string" || typeof v.filed !== "string" || !Array.isArray(v.years) || v.years.length === 0) return false;
  const yearsOk = (v.years as Record<string, unknown>[]).every((y) => isDay(y?.start) && isDay(y?.end) && YEAR_FIELDS.every((k) => isNumberOrNull(y[k])));
  const t = v.trailing as Record<string, unknown> | null;
  return yearsOk && (t === null || (isDay(t?.end) && PERIOD_FIELDS.every((k) => isNumberOrNull(t[k]))));
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
