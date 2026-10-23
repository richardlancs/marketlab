// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" refuses to load outside the server build; here it's just a marker.
vi.mock("server-only", () => ({}));
vi.mock("./season-data", () => ({ SEASON_TAG: "seasons" }));
// The session, storage and the book cookie are replaced with test doubles.
const owner = vi.hoisted(() => ({ current: { id: "user-1", kind: "user", pendingGuest: null } as { id: string; kind: "user" | "guest"; pendingGuest: null } | null }));
const seasons = vi.hoisted(() => ({ join: vi.fn(), entryOf: vi.fn(), entryByAccount: vi.fn(), history: vi.fn(), badgesOf: vi.fn() }));
const books = vi.hoisted(() => ({ cookie: "unset" as string | null, setBookCookie: vi.fn(async (id: string | null) => void (books.cookie = id)) }));
vi.mock("./owner", () => ({ currentOwner: async () => owner.current }));
vi.mock("./db", () => ({ seasons, leaderboard: { get: async () => ({ displayName: "Board name" }) } }));
vi.mock("./badge-check", () => ({ checkBadges: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("./books", () => ({
  PRACTICE: { id: null, label: "Practice portfolio", seasonId: null, readOnly: false },
  setBookCookie: books.setBookCookie,
  currentBook: async () => null,
  bookOf: (e: { accountId: string }) => ({ id: e.accountId, label: "season", seasonId: "2026-11", readOnly: false }),
  booksOf: async () => [],
  bookView: async () => ({ cash: 1, holdings: [], watchlist: [], trades: [] }),
}));

const { chooseBookAction, joinSeasonAction, seasonStatusAction } = await import("./season-actions");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-11-03T12:00:00Z"));
  owner.current = { id: "user-1", kind: "user", pendingGuest: null };
  books.cookie = "unset";
  seasons.entryOf.mockResolvedValue(null);
  seasons.join.mockResolvedValue({ status: "joined", accountId: "acct-1" });
});
afterEach(() => vi.useRealTimers());

describe("joining a season", () => {
  it("is for signed-in users, this month, in its first week", async () => {
    expect(await joinSeasonAction("2026-11", "Ann")).toEqual({ ok: true, book: "acct-1" });
    expect(seasons.join).toHaveBeenCalledWith("user-1", "2026-11", { displayName: "Ann", nameKey: "ann" }, Date.now());
    expect(books.cookie).toBe("acct-1"); // trading switches to the new portfolio

    expect(await joinSeasonAction("2026-10", "Ann")).toMatchObject({ ok: false }); // a past season
    expect(await joinSeasonAction("2026-11", "a")).toMatchObject({ ok: false }); // too short a name
    vi.setSystemTime(Date.parse("2026-11-08T00:00:00Z"));
    expect(await joinSeasonAction("2026-11", "Ann")).toMatchObject({ ok: false, message: expect.stringContaining("closed") });
    owner.current = { id: "guest-1", kind: "guest", pendingGuest: null };
    vi.setSystemTime(Date.parse("2026-11-03T12:00:00Z"));
    expect(await joinSeasonAction("2026-11", "Ann")).toMatchObject({ ok: false, message: expect.stringContaining("Sign in") });
    expect(seasons.join).toHaveBeenCalledTimes(1);
  });

  it("explains a taken name", async () => {
    seasons.join.mockResolvedValue({ status: "taken" });
    expect(await joinSeasonAction("2026-11", "Ann")).toMatchObject({ ok: false, message: expect.stringContaining("taken") });
    expect(books.cookie).toBe("unset");
  });

  it("offers the leaderboard name, and says whether you're in", async () => {
    expect(await seasonStatusAction("2026-11")).toMatchObject({ signedIn: true, canJoin: true, entry: null, suggestedName: "Board name" });
    seasons.entryOf.mockResolvedValue({ displayName: "Ann", joinedAt: 5, accountId: "acct-1" });
    expect(await seasonStatusAction("2026-11")).toMatchObject({ canJoin: false, entry: { displayName: "Ann", nameKey: "ann" } });
    expect(await seasonStatusAction("nope")).toBeNull();
  });
});

describe("switching portfolios", () => {
  it("only to one of your own", async () => {
    seasons.entryByAccount.mockResolvedValue(null);
    expect(await chooseBookAction("someone-elses")).toMatchObject({ ok: false });
    expect(books.cookie).toBe("unset");
    seasons.entryByAccount.mockResolvedValue({ accountId: "acct-1", seasonId: "2026-11", closedAt: null });
    expect(await chooseBookAction("acct-1")).toMatchObject({ ok: true, book: { id: "acct-1" } });
    expect(seasons.entryByAccount).toHaveBeenCalledWith("user-1", "acct-1");
    expect(books.cookie).toBe("acct-1");
    expect(await chooseBookAction(null)).toMatchObject({ ok: true, book: { id: null } });
    expect(books.cookie).toBeNull();
    expect(await chooseBookAction(42)).toMatchObject({ ok: false });
  });
});
