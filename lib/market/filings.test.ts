// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFilings, parseTickerMap } from "./filings";
import { parseTiingoNews } from "./tiingo";

// Next's cache functions only work inside Next; here they do nothing.
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("server-only", () => ({}));

describe("SEC filings", () => {
  it("maps tickers to CIKs", () => {
    expect(parseTickerMap({ 0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, 1: { cik_str: 1067983, ticker: "BRK-B", title: "Berkshire" } })).toEqual({ AAPL: 320193, "BRK-B": 1067983 });
    expect(parseTickerMap(null)).toEqual({});
  });

  it("keeps announcements and reports, newest first, with links and plain descriptions", () => {
    const data = {
      filings: {
        recent: {
          form: ["4", "8-K", "10-Q", "8-K", "SC 13G"],
          filingDate: ["2026-10-17", "2026-10-16", "2026-08-01", "2026-07-30", "2026-07-01"],
          accessionNumber: ["0001-26-000005", "0000320193-26-000101", "0000320193-26-000090", "0000320193-26-000080", "x"],
          primaryDocument: ["f4.xml", "aapl-8k.htm", "aapl-10q.htm", "aapl-8k2.htm", "x.htm"],
          items: ["", "2.02,9.01", "", "5.02", ""],
        },
      },
    };
    expect(parseFilings(320193, data)).toEqual([
      { form: "8-K", date: "2026-10-16", description: "Earnings results", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000101/aapl-8k.htm" },
      { form: "10-Q", date: "2026-08-01", description: "Quarterly report", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000090/aapl-10q.htm" },
      { form: "8-K", date: "2026-07-30", description: "Leadership change", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000080/aapl-8k2.htm" },
    ]);
    expect(parseFilings(1, {})).toEqual([]);
  });
});

describe("news", () => {
  it("keeps well-formed https headlines", () => {
    const rows = [
      { title: " Coca-Cola beats estimates ", url: "https://example.com/a", source: "example.com", publishedDate: "2026-10-16T13:00:00Z" },
      { title: "Sketchy", url: "javascript:alert(1)", publishedDate: "2026-10-16T13:00:00Z" },
    ];
    expect(parseTiingoNews(rows)).toEqual([{ title: "Coca-Cola beats estimates", url: "https://example.com/a", source: "example.com", published: "2026-10-16T13:00:00Z" }]);
  });
});

describe("getFilings and getNews", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fetch nothing without SEC_USER_AGENT, and no news without real data", async () => {
    vi.stubEnv("SEC_USER_AGENT", "");
    vi.stubEnv("TIINGO_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { getFilings, getNews } = await import("./index");
    expect(await getFilings("AAPL")).toBeNull();
    expect(await getNews("AAPL")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("send the SEC its required User-Agent, and never ask Tiingo for filings", async () => {
    vi.stubEnv("SEC_USER_AGENT", "MarketLab test@example.com");
    const fetchSpy = vi.fn(async (url: string) =>
      Response.json(url.includes("company_tickers") ? { 0: { cik_str: 21344, ticker: "KO" } } : { filings: { recent: { form: ["10-K"], filingDate: ["2026-02-20"], accessionNumber: ["0000021344-26-000010"], primaryDocument: ["ko-10k.htm"], items: [""] } } }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { getFilings } = await import("./index");
    expect(await getFilings("ko")).toEqual([expect.objectContaining({ form: "10-K", description: "Annual report" })]);
    expect(fetchSpy.mock.calls.every(([url]) => String(url).includes("sec.gov"))).toBe(true);
    expect((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ "User-Agent": "MarketLab test@example.com" });
  });
});
