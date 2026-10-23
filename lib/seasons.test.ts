import { describe, expect, it } from "vitest";
import { canJoin, daysLeft, isSeasonId, joinDeadline, previousSeasonId, rank, seasonBounds, seasonDue, seasonIdOf, seasonLabel, seasonMessages, seasonReturn } from "./seasons";

const at = (iso: string) => Date.parse(iso);
const none = { closedAt: null, announcedAt: null, remindedAt: null };

describe("season calendar", () => {
  it("names a season by its month, and knows its bounds", () => {
    expect(seasonIdOf(at("2026-11-03T21:00:00Z"))).toBe("2026-11");
    expect(seasonBounds("2026-12")).toEqual({ start: at("2026-12-01T00:00:00Z"), end: at("2027-01-01T00:00:00Z") });
    expect(previousSeasonId("2027-01")).toBe("2026-12");
    expect(seasonLabel("2026-11")).toBe("November 2026");
    expect(seasonLabel("2026-11", { short: true })).toBe("November");
    for (const bad of ["2026-13", "2026-1", "26-11", "2026-11-01", null, 202611]) expect(isSeasonId(bad)).toBe(false);
  });

  it("is open to join for the first seven days only", () => {
    expect(canJoin("2026-11", at("2026-10-31T23:59:59Z"))).toBe(false);
    expect(canJoin("2026-11", at("2026-11-01T00:00:00Z"))).toBe(true);
    expect(canJoin("2026-11", joinDeadline("2026-11") - 1)).toBe(true);
    expect(canJoin("2026-11", at("2026-11-08T00:00:00Z"))).toBe(false);
  });

  it("counts the days left, 0 on the last day", () => {
    expect(daysLeft("2026-11", at("2026-11-27T12:00:00Z"))).toBe(3);
    expect(daysLeft("2026-11", at("2026-11-30T12:00:00Z"))).toBe(0);
    expect(daysLeft("2026-11", at("2026-12-02T00:00:00Z"))).toBe(0);
  });
});

describe("standings", () => {
  it("rank the highest value first, ties to whoever joined first", () => {
    const ranked = rank([
      { accountId: "a", joinedAt: 2, value: 101_000 },
      { accountId: "b", joinedAt: 1, value: 101_000 },
      { accountId: "c", joinedAt: 0, value: 99_000 },
      { accountId: "d", joinedAt: 3, value: 120_000 },
    ]);
    expect(ranked.map((r) => [r.accountId, r.rank])).toEqual([["d", 1], ["b", 2], ["a", 3], ["c", 4]]);
    expect(seasonReturn(110_000)).toBeCloseTo(0.1);
  });
});

describe("what the daily job does", () => {
  it("records closes during the season and closes it once the market moves on", () => {
    expect(seasonDue("2026-11", at("2026-11-20T21:00:00Z"), at("2026-11-20T21:30:00Z"), none)).toMatchObject({ record: true, close: false });
    expect(seasonDue("2026-11", at("2026-12-01T21:00:00Z"), at("2026-12-01T21:30:00Z"), none)).toMatchObject({ record: false, close: true });
    expect(seasonDue("2026-11", at("2026-12-01T21:00:00Z"), at("2026-12-01T21:30:00Z"), { ...none, closedAt: 1 })).toMatchObject({ record: false, close: false });
  });

  it("announces once while joining is open, and reminds once in the last three days", () => {
    expect(seasonDue("2026-11", at("2026-11-02T21:00:00Z"), at("2026-11-02T21:30:00Z"), none).announce).toBe(true);
    expect(seasonDue("2026-11", at("2026-11-02T21:00:00Z"), at("2026-11-02T21:30:00Z"), { ...none, announcedAt: 1 }).announce).toBe(false);
    expect(seasonDue("2026-11", at("2026-11-10T21:00:00Z"), at("2026-11-10T21:30:00Z"), none).announce).toBe(false);
    expect(seasonDue("2026-11", at("2026-11-26T21:00:00Z"), at("2026-11-26T21:30:00Z"), none).remind).toBe(false);
    expect(seasonDue("2026-11", at("2026-11-27T21:00:00Z"), at("2026-11-27T21:30:00Z"), none).remind).toBe(true);
    expect(seasonDue("2026-11", at("2026-11-27T21:00:00Z"), at("2026-11-27T21:30:00Z"), { ...none, remindedAt: 1 }).remind).toBe(false);
  });

  it("words its notifications with the place and season", () => {
    expect(seasonMessages.result("2026-11", 4, 57, 112_345)).toEqual({ title: "November season over", body: "You finished #4 of 57, at $112,345.", url: "/leaderboard/season/2026-11" });
    expect(seasonMessages.reminder("2026-11", 12, 40).body).toBe("You're #12 of 40.");
    expect(seasonMessages.open("2026-11").body).toContain("Join by Nov 7");
  });
});
