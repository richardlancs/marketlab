import { describe, expect, it } from "vitest";
import { badgeIcons, lessonBadges, longestStreak, seasonBadges, streakBadges } from "./badges";

const DAY = 86_400_000;

describe("badges", () => {
  it("for lessons: the first, ten, and every one", () => {
    expect(lessonBadges(0, 40)).toEqual([]);
    expect(lessonBadges(1, 40).map((b) => b.kind)).toEqual(["first-lesson"]);
    expect(lessonBadges(10, 40).map((b) => b.kind)).toEqual(["first-lesson", "ten-lessons"]);
    expect(lessonBadges(40, 40).map((b) => b.kind)).toEqual(["first-lesson", "ten-lessons", "all-lessons"]);
  });

  it("for a seven-day streak of activity on consecutive days", () => {
    const days = (list: number[]) => list.map((d) => d * DAY + 3_600_000);
    expect(longestStreak(days([1, 2, 3, 5, 6]))).toBe(3);
    expect(longestStreak(days([1, 1, 2]))).toBe(2); // two things on one day count once
    expect(longestStreak([])).toBe(0);
    expect(streakBadges(days([10, 11, 12, 13, 14, 15]))).toEqual([]);
    expect(streakBadges(days([16, 10, 11, 12, 13, 14, 15]))).toEqual([{ kind: "streak-7", scope: "" }]);
  });

  it("for a season's placing, once there are enough players for it to mean something", () => {
    const kinds = (rank: number, n: number) => seasonBadges("2026-11", rank, n).map((b) => b.kind);
    expect(kinds(1, 1)).toEqual(["season-finished"]);
    expect(kinds(1, 2)).toEqual(["season-finished", "season-winner"]);
    expect(kinds(3, 5)).toEqual(["season-finished", "season-podium"]);
    expect(kinds(4, 40)).toEqual(["season-finished", "season-top10"]);
    expect(kinds(5, 40)).toEqual(["season-finished"]);
    expect(kinds(1, 40)).toEqual(["season-finished", "season-top10", "season-podium", "season-winner"]);
    expect(seasonBadges("2026-11", 1, 1)[0].scope).toBe("2026-11");
  });

  it("show the most impressive first, counted", () => {
    expect(badgeIcons([{ kind: "first-lesson", scope: "" }, { kind: "season-winner", scope: "2026-10" }, { kind: "season-winner", scope: "2026-11" }])).toEqual([
      { kind: "season-winner", count: 2 },
      { kind: "first-lesson", count: 1 },
    ]);
  });
});
