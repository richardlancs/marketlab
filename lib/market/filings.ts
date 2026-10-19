/**
 * Company filings from the SEC's EDGAR system: 8-K announcements (results,
 * deals, leadership changes…), quarterly 10-Q and annual 10-K reports. They're
 * public records, so unlike Tiingo's data they can be shown on the public site.
 *
 * The SEC asks every automated request to say who's asking: a User-Agent with
 * a name and a contact email (SEC_USER_AGENT, e.g. "MarketLab you@example.com").
 * Without it, nothing is fetched and the filings card is hidden. Requests are
 * cached (the ticker list for a week, each company's filings for hours), so
 * the site stays far below the SEC's limit of 10 requests a second.
 *
 * Parsing is here, pure and tested; the cached fetching is getFilings() in
 * ./index.ts (server only).
 */

export interface Filing {
  form: string;
  /** YYYY-MM-DD */
  date: string;
  /** What it's about, in words. */
  description: string;
  url: string;
}

/** The forms worth showing: announcements and reports (US and foreign companies). */
const FORMS = new Set(["8-K", "10-Q", "10-K", "6-K", "20-F", "40-F"]);

const FORM_NAMES: Record<string, string> = {
  "10-Q": "Quarterly report",
  "10-K": "Annual report",
  "20-F": "Annual report (foreign company)",
  "40-F": "Annual report (Canadian company)",
  "6-K": "Report (foreign company)",
};

/** The common 8-K item numbers, in plain words. */
const ITEMS: Record<string, string> = {
  "1.01": "New material agreement",
  "1.02": "Agreement ended",
  "2.01": "Acquisition or sale completed",
  "2.02": "Earnings results",
  "2.03": "New debt",
  "2.05": "Restructuring costs",
  "3.01": "Listing notice",
  "5.02": "Leadership change",
  "5.03": "Bylaws changed",
  "5.07": "Shareholder vote results",
  "7.01": "Investor disclosure",
  "8.01": "Other news",
};

/** The SEC's ticker list (company_tickers.json) as ticker → CIK. Tickers there use "BRK-B" like ours. */
export function parseTickerMap(data: unknown): Record<string, number> {
  const map: Record<string, number> = {};
  if (typeof data !== "object" || data === null) return map;
  for (const entry of Object.values(data as Record<string, unknown>)) {
    const { ticker, cik_str: cik } = (entry ?? {}) as Record<string, unknown>;
    if (typeof ticker === "string" && Number.isInteger(cik)) map[ticker.toUpperCase()] ??= cik as number;
  }
  return map;
}

/** A company's recent filings (data.sec.gov/submissions/CIK##########.json), newest first, the useful kinds only. */
export function parseFilings(cik: number, data: unknown, limit = 8): Filing[] {
  const recent = (data as { filings?: { recent?: Record<string, unknown> } } | null)?.filings?.recent;
  if (!recent) return [];
  const column = (name: string) => (Array.isArray(recent[name]) ? (recent[name] as unknown[]) : []);
  const forms = column("form");
  const dates = column("filingDate");
  const accessions = column("accessionNumber");
  const documents = column("primaryDocument");
  const items = column("items");
  const filings: Filing[] = [];
  for (let i = 0; i < forms.length && filings.length < limit; i++) {
    const form = forms[i];
    const date = dates[i];
    const accession = accessions[i];
    const document = documents[i];
    if (typeof form !== "string" || !FORMS.has(form) || typeof date !== "string" || typeof accession !== "string" || typeof document !== "string") continue;
    const codes = typeof items[i] === "string" ? (items[i] as string).split(",").map((s) => s.trim()) : [];
    const named = codes.map((c) => ITEMS[c]).filter(Boolean);
    filings.push({
      form,
      date,
      description: form === "8-K" ? named.join(" · ") || "Announcement" : (FORM_NAMES[form] ?? form),
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/${encodeURIComponent(document)}`,
    });
  }
  return filings;
}
