import { describe, expect, it } from "vitest";
import { checkDisplayName } from "./leaderboard";

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
