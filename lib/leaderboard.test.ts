import { describe, expect, it } from "vitest";
import { checkDisplayName, standings, type Member } from "./leaderboard";

describe("display names", () => {
  it("accepts and tidies sensible names", () => {
    expect(checkDisplayName("  Richard   L  ")).toEqual({ ok: true, name: "Richard L", key: "richard l" });
    expect(checkDisplayName("trader_42")).toMatchObject({ ok: true });
    expect(checkDisplayName("Zoë")).toMatchObject({ ok: true });
  });

  it.each([
    ["too short", "ab"],
    ["too long", "a".repeat(25)],
    ["an email", "me@example.com"],
    ["markup", "<b>hi</b>"],
    ["a link", "http://x.co"],
    ["not text", 42],
  ])("rejects %s", (_, name) => {
    expect(checkDisplayName(name)).toMatchObject({ ok: false });
  });
});

describe("standings", () => {
  const DAY = 86_400_000;
  const member = (name: string, startValue: number, cash: number, holdings: Member["holdings"] = [], joinedAt = 0): Member => ({ displayName: name, joinedAt, startValue, cash, holdings });

  it("ranks by return since joining, whatever each started with", () => {
    const rows = standings(
      [member("Big", 100_000, 105_000), member("Small", 10_000, 12_000), member("Down", 25_000, 20_000)],
      () => undefined,
      10 * DAY,
    );
    expect(rows.map((r) => [r.rank, r.displayName])).toEqual([[1, "Small"], [2, "Big"], [3, "Down"]]);
    expect(rows[0]).toMatchObject({ value: 12_000, daysOnBoard: 10 });
    expect(rows[0].returnSinceJoining).toBeCloseTo(0.2);
  });

  it("values holdings at today's price, or at cost when there's none", () => {
    const rows = standings([member("A", 1000, 0, [{ symbol: "KO", shares: 10, averageCost: 90 }, { symbol: "ZZ", shares: 1, averageCost: 50 }])], (s) => (s === "KO" ? 100 : undefined), 0);
    expect(rows[0].value).toBe(1050);
  });

  it("breaks ties by who joined first", () => {
    const rows = standings([member("Later", 100, 110, [], 5), member("Earlier", 100, 110, [], 1)], () => undefined, 10);
    expect(rows.map((r) => r.displayName)).toEqual(["Earlier", "Later"]);
  });
});
