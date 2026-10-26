import { describe, expect, it } from "vitest";
import { describeExposures, parseFactorExposures, type FactorExposures } from "./factors";

const exposures = (betas: Partial<FactorExposures["betas"]>, tStats: Partial<FactorExposures["tStats"]> = {}, r2 = 0.5): FactorExposures => ({
  betas: { market: 1, size: 0, value: 0, momentum: 0, lowVol: 0, ...betas },
  tStats: { market: 10, size: 0, value: 0, momentum: 0, lowVol: 0, ...tStats },
  alpha: 0.01,
  alphaT: 0.5,
  r2,
  residualVolatility: 0.2,
  sessions: 252,
  start: 1,
  asOf: 2,
});

describe("factor exposures", () => {
  it("are described in plain words, mentioning only clear tilts", () => {
    expect(describeExposures(exposures({ market: 1.24, size: -0.6, value: -0.4, momentum: 0.1 }, { size: -5, value: -3, momentum: 0.8 }), "NVDA")).toBe(
      "NVDA moves about 1.2× as much as the market, and behaves like large companies and expensive (growth) stocks.",
    );
    expect(describeExposures(exposures({ market: 0.95 }), "It")).toBe("It moves about as much as the market.");
    expect(describeExposures(exposures({ market: 0.6 }, {}, 0.2), "KO")).toMatch(/explain little/);
  });

  it("are checked when read", () => {
    expect(parseFactorExposures(exposures({}))).not.toBeNull();
    expect(parseFactorExposures({ ...exposures({}), betas: { market: "1" } })).toBeNull();
    expect(parseFactorExposures(null)).toBeNull();
  });
});
