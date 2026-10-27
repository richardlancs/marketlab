import { describe, expect, it } from "vitest";
import review from "./fixtures/review.json";
import { dispositionVerdict, parseReview, type TradeReview } from "./types";

// The fixture is the analytics service's own output (review.review on a simulated account).
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

describe("verdicts", () => {
  it("names the disposition effect only with enough selling days", () => {
    const d = (pgr: number, plr: number, enough = true) => ({ ...review.disposition, pgr, plr, difference: enough ? pgr - plr : null, enough });
    expect(dispositionVerdict(d(0.4, 0.1))).toMatch(/sell winners more readily/);
    expect(dispositionVerdict(d(0.1, 0.4))).toMatch(/cut losers more readily/);
    expect(dispositionVerdict(d(0.2, 0.2))).toMatch(/about the same/);
    expect(dispositionVerdict(d(0.4, 0.1, false))).toBeNull();
  });
});
