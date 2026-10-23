// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Storage, the market and the push service are replaced with test doubles.
const entry = (userId: string, accountId: string, joinedAt: number, cash: number, holdings: { symbol: string; shares: number; averageCost: number }[] = []) => ({
  seasonId: "2026-11", userId, accountId, displayName: userId, joinedAt, startValue: 100_000, finalValue: null, finalRank: null, closedAt: null, cash, holdings,
});
const seasons = vi.hoisted(() => ({
  ensure: vi.fn(),
  open: vi.fn(),
  entriesWithHoldings: vi.fn(),
  recordStandings: vi.fn(),
  lastValues: vi.fn(),
  close: vi.fn(),
  award: vi.fn(),
  markAnnounced: vi.fn(),
  markReminded: vi.fn(),
  ownersOf: vi.fn(),
}));
const push = vi.hoisted(() => ({ devicesOf: vi.fn(), remove: vi.fn() }));
const sent = vi.hoisted(() => [] as { endpoint: string; title: string }[]);
vi.mock("./db", () => ({ seasons, push, alertEmails: { enabled: async () => false }, db: {} }));
vi.mock("./market", () => ({ getMarket: async () => ({ stocks: [{ symbol: "KO", price: 80 }] }) }));
vi.mock("./alert-pushes", () => ({
  pushPublicKey: () => "key",
  sendPush: vi.fn(async (device: { endpoint: string }, message: { title: string }) => (sent.push({ endpoint: device.endpoint, title: message.title }), "sent")),
}));
vi.mock("./email", () => ({ emailEnabled: () => false, sendEmail: vi.fn() }));
vi.mock("./season-data", async () => {
  const { valueEntries } = await vi.importActual<typeof import("./season-data")>("./season-data");
  return { valueEntries };
});
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const { runSeasons } = await import("./season-job");

const at = (iso: string) => Date.parse(iso);
const flags = { closedAt: null, announcedAt: 1, remindedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  seasons.open.mockResolvedValue([{ id: "2026-11", createdAt: 0, ...flags }]);
  seasons.entriesWithHoldings.mockResolvedValue([entry("ann", "a1", 1, 92_000, [{ symbol: "KO", shares: 100, averageCost: 70 }]), entry("bob", "b1", 2, 100_000)]);
  push.devicesOf.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, [{ endpoint: `https://fcm.googleapis.com/${id}`, p256dh: "k", auth: "a" }]])));
  seasons.ownersOf.mockResolvedValue([]);
});

describe("the daily season step", () => {
  it("records each entry's value at the close, at today's prices", async () => {
    const summary = await runSeasons(at("2026-11-10T21:00:00Z"), Infinity, () => at("2026-11-10T21:30:00Z"));
    expect(seasons.recordStandings).toHaveBeenCalledWith(at("2026-11-10T21:00:00Z"), [{ accountId: "a1", value: 100_000 }, { accountId: "b1", value: 100_000 }]);
    expect(summary).toMatchObject({ recorded: 2, closed: [] });
    expect(seasons.close).not.toHaveBeenCalled();
  });

  it("closes a season on its last recorded values, awards badges and tells everyone their place", async () => {
    seasons.lastValues.mockResolvedValue(new Map([["a1", 103_000], ["b1", 101_000]]));
    const summary = await runSeasons(at("2026-12-01T21:00:00Z"), Infinity, () => at("2026-12-01T21:30:00Z"));
    expect(seasons.recordStandings).not.toHaveBeenCalled(); // the December close isn't November's
    expect(seasons.close).toHaveBeenCalledWith("2026-11", [{ accountId: "a1", value: 103_000, rank: 1 }, { accountId: "b1", value: 101_000, rank: 2 }], expect.any(Number));
    expect(seasons.award).toHaveBeenCalledWith("ann", [{ kind: "season-finished", scope: "2026-11" }, { kind: "season-winner", scope: "2026-11" }], expect.any(Number));
    expect(sent.map((s) => s.title)).toEqual(["November season over", "November season over"]);
    expect(summary).toMatchObject({ closed: ["2026-11"], notified: 2 });
  });

  it("someone who joined after the last close finishes on their starting value", async () => {
    seasons.lastValues.mockResolvedValue(new Map([["a1", 99_000]]));
    await runSeasons(at("2026-12-01T21:00:00Z"), Infinity, () => at("2026-12-01T21:30:00Z"));
    expect(seasons.close.mock.calls[0][1]).toEqual([{ accountId: "b1", value: 100_000, rank: 1 }, { accountId: "a1", value: 99_000, rank: 2 }]);
  });

  it("reminds once, three days before the end, and announces a new season to last season's players", async () => {
    await runSeasons(at("2026-11-27T21:00:00Z"), Infinity, () => at("2026-11-27T21:30:00Z"));
    expect(sent.map((s) => s.title)).toEqual(["November season: 3 days left", "November season: 3 days left"]);
    expect(seasons.markReminded).toHaveBeenCalledWith("2026-11", expect.any(Number));

    sent.length = 0;
    seasons.open.mockResolvedValue([{ id: "2026-12", createdAt: 0, closedAt: null, announcedAt: null, remindedAt: null }]);
    seasons.entriesWithHoldings.mockResolvedValue([]);
    seasons.ownersOf.mockResolvedValue(["ann"]);
    await runSeasons(at("2026-12-01T21:00:00Z"), Infinity, () => at("2026-12-01T21:30:00Z"));
    expect(seasons.ownersOf).toHaveBeenCalledWith("2026-11");
    expect(sent).toEqual([{ endpoint: "https://fcm.googleapis.com/ann", title: "The December season is open" }]);
    expect(seasons.markAnnounced).toHaveBeenCalledWith("2026-12", expect.any(Number));
  });
});
