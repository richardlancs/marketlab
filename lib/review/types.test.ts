import { describe, expect, it } from "vitest";
import luck from "./fixtures/luck.json";
import review from "./fixtures/review.json";
import { accountLuckVerdict, dispositionVerdict, parseAccountLuck, parseReview, type TradeReview } from "./types";

// The fixtures are the analytics service's own output (review.review and luck.account_luck on a simulated account).
describe("parseReview", () => {
  it("accepts the analytics service's review", () => {
    const parsed = parseReview(review);
    expect(parsed?.status).toBe("ok");
    const r = parsed as TradeReview;
    expect(r.summary.roundTrips).toBe(6);
    expect(r.byReason.map((g) => g.reason)).toContain("none");
    expect(r.compared?.times.length).toBe(r.compared?.actual.length);
  });

  it("accepts an account with no trades", () => {
    expect(parseReview({ status: "no-trades" })).toEqual({ status: "no-trades" });
  });

  it("rejects broken shapes", () => {
    expect(parseReview(null)).toBeNull();
    expect(parseReview({ ...review, roundTrips: [{ ...review.roundTrips[0], reason: "astrology" }] })).toBeNull();
    expect(parseReview({ ...review, disposition: { ...review.disposition, enough: "yes" } })).toBeNull();
    expect(parseReview({ ...review, compared: { ...review.compared, kept: [1] } })).toBeNull();
  });
});

describe("parseAccountLuck", () => {
  it("accepts the analytics service's comparison", () => {
    const parsed = parseAccountLuck(luck);
    expect(parsed?.timing?.trials).toBe(1000);
    expect(parsed?.picking?.kind).toBe("picking");
  });

  it("rejects broken shapes", () => {
    expect(parseAccountLuck({ ...luck, timing: { ...luck.timing, kind: "vibes" } })).toBeNull();
    expect(parseAccountLuck({ ...luck, trips: "7" })).toBeNull();
  });
});

describe("verdicts", () => {
  const comparison = (beat: number) => ({ ...luck.timing, kind: "timing" as const, percentile: { totalReturn: beat, sharpe: null } });

  it("grades the account against random traders", () => {
    expect(accountLuckVerdict(comparison(0.97))).toMatch(/^Your trades beat 97% .*may have mattered/);
    expect(accountLuckVerdict(comparison(0.5))).toMatch(/about what chance gives/);
    expect(accountLuckVerdict(comparison(0.1))).toMatch(/did better most of the time/);
  });

  it("names the disposition effect only with enough selling days", () => {
    const d = (pgr: number, plr: number, enough = true) => ({ ...review.disposition, pgr, plr, difference: enough ? pgr - plr : null, enough });
    expect(dispositionVerdict(d(0.4, 0.1))).toMatch(/sell winners more readily/);
    expect(dispositionVerdict(d(0.1, 0.4))).toMatch(/cut losers more readily/);
    expect(dispositionVerdict(d(0.2, 0.2))).toMatch(/about the same/);
    expect(dispositionVerdict(d(0.4, 0.1, false))).toBeNull();
  });
});
