// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./analytics/fixtures/screen-result.json";

// The analytics service, the rate limit, storage and the visitor are replaced with test doubles.
const analytics = vi.hoisted(() => ({
  screenHistoryOnServer: vi.fn(),
  saveScreenOnServer: vi.fn(),
  reproduceScreenOnServer: vi.fn(),
  screenConfigOf: (settings: object) => ({ version: 1, ...settings, universe: ["AAPL", "MSFT"] }),
}));
const db = vi.hoisted(() => ({ backtests: { getScreen: vi.fn(), listScreens: vi.fn() } }));
const owner = vi.hoisted(() => ({ current: { id: "user-1", kind: "user", pendingGuest: null } as { id: string; kind: string; pendingGuest: null } | null }));
const limits = vi.hoisted(() => ({ allowed: true, calls: [] as string[] }));
vi.mock("./analytics/server", () => analytics);
vi.mock("./db", () => db);
vi.mock("./owner", () => ({ currentOwner: async () => owner.current }));
vi.mock("./rate-limit", () => ({
  allow: async (name: string) => {
    limits.calls.push(name);
    return limits.allowed;
  },
}));

const { listSavedScreensAction, loadSavedScreenAction, reproduceSavedScreenAction, runScreenHistoryAction, saveScreenAction } = await import("./screen-actions");

const settings = { preset: "momentum", start: 1_700_000_000_000, end: 1_760_000_000_000, initialCash: 10_000, costs: { commission: 1, slippageBps: 5 } };

beforeEach(() => {
  vi.clearAllMocks();
  owner.current = { id: "user-1", kind: "user", pendingGuest: null };
  limits.allowed = true;
  limits.calls = [];
  analytics.screenHistoryOnServer.mockResolvedValue({ ok: true, result: fixture });
});

describe("running a historical screen", () => {
  it("validates the settings before calling the service", async () => {
    expect(await runScreenHistoryAction({ ...settings, initialCash: -1 })).toMatchObject({ ok: false });
    expect(await runScreenHistoryAction({ ...settings, preset: "growth" })).toMatchObject({ ok: false });
    expect(analytics.screenHistoryOnServer).not.toHaveBeenCalled();
    expect(await runScreenHistoryAction(settings)).toMatchObject({ ok: true });
    expect(analytics.screenHistoryOnServer).toHaveBeenCalledWith(settings);
  });

  it("never lets the browser choose the candidates", async () => {
    await runScreenHistoryAction({ ...settings, universe: ["ONLY"] });
    expect(analytics.screenHistoryOnServer.mock.calls[0][0]).not.toHaveProperty("universe");
  });

  it("is rate limited per visitor", async () => {
    limits.allowed = false;
    expect(await runScreenHistoryAction(settings)).toMatchObject({ ok: false, message: expect.stringContaining("Wait a minute") });
    expect(limits.calls).toEqual(["screen-history"]);
    expect(analytics.screenHistoryOnServer).not.toHaveBeenCalled();
  });
});

describe("saved historical screens", () => {
  it("saves for the visitor, with the server's own candidate list", async () => {
    analytics.saveScreenOnServer.mockResolvedValue({ ok: true, summary: { totalReturn: 0.1 }, result: fixture });
    const saved = await saveScreenAction("  Leaders  ", settings);
    expect(saved).toMatchObject({ ok: true, run: { name: "Leaders", config: { universe: ["AAPL", "MSFT"] }, stored: { simulated: true } } });
    const [ownerId, run, config] = analytics.saveScreenOnServer.mock.calls[0];
    expect(ownerId).toBe("user-1");
    expect(run.name).toBe("Leaders");
    expect(config).toMatchObject({ version: 1, preset: "momentum", universe: ["AAPL", "MSFT"] });
  });

  it("refuses a missing name or bad settings without saving", async () => {
    expect(await saveScreenAction("", settings)).toMatchObject({ ok: false });
    expect(await saveScreenAction("x".repeat(81), settings)).toMatchObject({ ok: false });
    expect(await saveScreenAction("Leaders", { ...settings, end: 0 })).toMatchObject({ ok: false });
    expect(analytics.saveScreenOnServer).not.toHaveBeenCalled();
  });

  it("passes on the service's refusal, such as a full list", async () => {
    analytics.saveScreenOnServer.mockResolvedValue({ ok: false, message: "You can save up to 50 runs. Delete one to make room." });
    expect(await saveScreenAction("Leaders", settings)).toEqual({ ok: false, message: "You can save up to 50 runs. Delete one to make room." });
  });

  it("opens only the visitor's own runs", async () => {
    db.backtests.getScreen.mockResolvedValue(null);
    expect(await loadSavedScreenAction("someone-elses")).toMatchObject({ ok: false });
    expect(db.backtests.getScreen).toHaveBeenCalledWith("user-1", "someone-elses");
    db.backtests.getScreen.mockResolvedValue({ run: { id: "r1" }, result: fixture });
    expect(await loadSavedScreenAction("r1")).toMatchObject({ ok: true, result: fixture });
    owner.current = null;
    expect(await loadSavedScreenAction("r1")).toMatchObject({ ok: false });
    expect(await listSavedScreensAction()).toEqual({ runs: [], limit: 50 });
  });

  it("reproduces only the visitor's own runs, through the service", async () => {
    db.backtests.getScreen.mockResolvedValue(null);
    expect(await reproduceSavedScreenAction("someone-elses")).toMatchObject({ ok: false });
    expect(analytics.reproduceScreenOnServer).not.toHaveBeenCalled();
    db.backtests.getScreen.mockResolvedValue({ run: { id: "r1" }, result: fixture });
    analytics.reproduceScreenOnServer.mockResolvedValue({ ok: true, reproduced: fixture, comparison: { matches: true, largestDifference: 0, differences: [] } });
    expect(await reproduceSavedScreenAction("r1")).toMatchObject({ ok: true, comparison: { matches: true } });
    expect(analytics.reproduceScreenOnServer).toHaveBeenCalledWith("r1", "user-1");
    expect(await reproduceSavedScreenAction({ id: "r1" })).toMatchObject({ ok: false });
  });
});
