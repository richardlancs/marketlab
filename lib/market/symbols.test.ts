import { describe, expect, it } from "vitest";
import { createBudget } from "./budget";
import { CATALOG, catalogEntry } from "./catalog";
import { isTiingoBlocked, marketMode } from "./mode";
import { isSymbolFormat, normalizeSymbol, parseSymbolQuery } from "./symbols";
import { STOCKS } from "./universe";

describe("symbols", () => {
  it("normalizes to one canonical spelling", () => {
    expect(normalizeSymbol(" brk.b ")).toBe("BRK-B");
    expect(normalizeSymbol("aapl")).toBe("AAPL");
  });

  it.each(["AAPL", "V", "BRK-B", "GOOGL"])("accepts %s", (symbol) => {
    expect(isSymbolFormat(symbol)).toBe(true);
  });

  it.each(["", "../x", "TOOLONGSYM", "1ABC", "aapl", "A B", 42])("rejects %j", (value) => {
    expect(isSymbolFormat(value)).toBe(false);
  });
});

describe("parseSymbolQuery", () => {
  const query = (...symbols: string[]) => new URLSearchParams(symbols.map((s) => ["symbol", s]));

  it("normalizes and removes repeats", () => {
    expect(parseSymbolQuery(query("ko", "KO", "brk.b"), 5)).toEqual(["KO", "BRK-B"]);
  });

  it("rejects none, too many, or a malformed one", () => {
    expect(parseSymbolQuery(query(), 5)).toBeNull();
    expect(parseSymbolQuery(query("A", "B", "C"), 2)).toBeNull();
    expect(parseSymbolQuery(query("AAPL", "../x"), 5)).toBeNull();
  });
});

describe("catalog", () => {
  it("lists each stock once, in canonical form, core stocks first", () => {
    const symbols = CATALOG.map((s) => s.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols.every((s) => isSymbolFormat(s) && normalizeSymbol(s) === s)).toBe(true);
    expect(symbols.slice(0, STOCKS.length)).toEqual(STOCKS.map((s) => s.symbol));
    expect(CATALOG.length).toBeGreaterThanOrEqual(90);
  });

  it("finds entries by canonical symbol only", () => {
    expect(catalogEntry("KO")?.name).toBe("Coca-Cola Co.");
    expect(catalogEntry("ko")).toBeUndefined();
    expect(catalogEntry("ZZZZ")).toBeUndefined();
  });
});

describe("request budget", () => {
  const HOUR = 3600_000;
  const limits = { hourly: 10, daily: 15, reserved: 4 };

  it("stops extra requests early, keeping room for core ones", () => {
    const budget = createBudget(limits);
    for (let i = 0; i < 6; i++) expect(budget.take(false, 0)).toBe(true);
    expect(budget.take(false, 0)).toBe(false);
    expect(budget.take(true, 0)).toBe(true);
  });

  it("starts each hour fresh, within the daily limit", () => {
    const budget = createBudget(limits);
    for (let i = 0; i < 6; i++) budget.take(false, 0);
    expect(budget.take(false, HOUR)).toBe(true);
    for (let i = 0; i < 4; i++) budget.take(false, HOUR);
    // 11 of 15 used today, 4 reserved for core requests.
    expect(budget.take(false, 2 * HOUR)).toBe(false);
    expect(budget.take(true, 2 * HOUR)).toBe(true);
  });

  it("sends nothing for an hour after Tiingo says the limit was reached", () => {
    const budget = createBudget(limits);
    budget.exhaust(0);
    expect(budget.take(true, HOUR - 1)).toBe(false);
    expect(budget.take(true, HOUR)).toBe(true);
  });
});

describe("market mode", () => {
  it("uses Tiingo only with a key", () => {
    expect(marketMode({})).toBe("mock");
    expect(marketMode({ TIINGO_API_KEY: "k" })).toBe("tiingo");
    expect(marketMode({ TIINGO_API_KEY: "k", MARKET_DATA_SOURCE: "mock" })).toBe("mock");
  });

  it("ignores the key on Vercel unless the deployment is marked private", () => {
    expect(marketMode({ TIINGO_API_KEY: "k", VERCEL_ENV: "production" })).toBe("mock");
    expect(isTiingoBlocked({ TIINGO_API_KEY: "k", VERCEL_ENV: "production" })).toBe(true);
    expect(marketMode({ TIINGO_API_KEY: "k", VERCEL_ENV: "production", MARKET_DATA_PRIVATE: "1" })).toBe("tiingo");
    expect(isTiingoBlocked({ VERCEL_ENV: "production" })).toBe(false);
  });
});
