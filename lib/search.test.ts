import { describe, expect, it } from "vitest";
import { searchStocks } from "./search";

const stocks = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "AMZN", name: "Amazon.com Inc." },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "META", name: "Meta Platforms Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "NFLX", name: "Netflix Inc." },
  { symbol: "V", name: "Visa Inc." },
];
const search = (query: string) => searchStocks(query, stocks).map((s) => s.symbol);

describe("searchStocks", () => {
  it("puts an exact symbol match first", () => {
    // V is an exact match; Visa's name doesn't make it appear twice.
    expect(search("v")).toEqual(["V"]);
    expect(search("meta")).toEqual(["META"]);
  });

  it("ranks symbol prefixes above name matches", () => {
    // AAPL and AMZN start with "a"; Alphabet only matches by name.
    expect(search("a").slice(0, 3)).toEqual(["AAPL", "AMZN", "GOOGL"]);
  });

  it("matches the start of any word in the name", () => {
    expect(search("plat")).toEqual(["META"]);
    expect(search("com")).toEqual(["AMZN"]); // "Amazon.com": the dot separates words
  });

  it("falls back to matches anywhere, after word starts", () => {
    expect(search("flix")).toEqual(["NFLX"]);
    expect(search("soft")).toEqual(["MSFT"]); // inside "Microsoft", not at a word start
    expect(search("zon")).toEqual(["AMZN"]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(search("  ApPlE ")).toEqual(["AAPL"]);
  });

  it("matches multi-word queries against the name", () => {
    expect(search("apple inc")).toEqual(["AAPL"]);
  });

  it("returns nothing for an empty query or no match", () => {
    expect(search("")).toEqual([]);
    expect(search("   ")).toEqual([]);
    expect(search("zzz")).toEqual([]);
  });
});
