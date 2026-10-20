import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { LOGO_FILES } from "./logo-files";
import { LOGO_DOMAINS } from "./logos";

describe("logos", () => {
  it("knows every catalog company's website", () => {
    expect(CATALOG.map((s) => s.symbol).filter((s) => !LOGO_DOMAINS[s])).toEqual([]);
  });

  it("only lists logos that exist, for catalog stocks", () => {
    const symbols = new Set(CATALOG.map((s) => s.symbol));
    for (const [symbol, logo] of Object.entries(LOGO_FILES)) {
      expect(symbols.has(symbol), symbol).toBe(true);
      expect(existsSync(join(process.cwd(), "public", logo.src)), logo.src).toBe(true);
    }
  });
});
