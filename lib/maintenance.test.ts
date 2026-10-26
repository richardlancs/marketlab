import { describe, expect, it, vi } from "vitest";
import { GUEST_LIFETIME, runDaily, type DailyDeps } from "./maintenance";

/** A fake world: accounts behind the close, and a clock that moves `tick` ms per call. */
function world(behind: string[], { tick = 1, stuck = [] as string[], broken = [] as string[] } = {}) {
  let clock = 1_000_000;
  const pending = new Set(behind);
  const deps: DailyDeps = {
    now: () => (clock += tick),
    latestClose: async () => 500,
    listBehind: async (_latest, limit) => [...pending].slice(0, limit),
    catchUp: vi.fn(async (id: string) => {
      if (broken.includes(id)) throw new Error("no prices");
      if (!stuck.includes(id)) pending.delete(id); // a stuck account stays behind without failing
    }),
    deleteInactiveGuests: vi.fn(async () => 3),
    deleteOrphanLearners: vi.fn(async () => 1),
    pruneRateLimits: vi.fn(async () => {}),
    deleteOrphanSnapshots: vi.fn(async () => 2),
  };
  return { deps, pending };
}

describe("the daily job", () => {
  it("catches up every account that's behind, in batches", async () => {
    const { deps, pending } = world(Array.from({ length: 120 }, (_, i) => `u${i}`));
    const summary = await runDaily(deps, { batch: 50 });
    expect(summary).toMatchObject({ latestClose: 500, caughtUp: 120, failed: 0, unfinished: false, guestsDeleted: 3, learnersDeleted: 1, snapshotsDeleted: 2 });
    expect(pending.size).toBe(0);
  });

  it("tries an account that can't advance once, instead of looping on it", async () => {
    const { deps } = world(["a", "stuck", "b"], { stuck: ["stuck"] });
    const summary = await runDaily(deps);
    expect(deps.catchUp).toHaveBeenCalledTimes(3);
    expect(summary.unfinished).toBe(false);
  });

  it("counts failures and carries on", async () => {
    const { deps } = world(["a", "broken", "b"], { broken: ["broken"] });
    expect(await runDaily(deps)).toMatchObject({ caughtUp: 2, failed: 1 });
  });

  it("stops when time runs out, leaving the rest for next time", async () => {
    const { deps, pending } = world(Array.from({ length: 100 }, (_, i) => `u${i}`), { tick: 1_000 });
    const summary = await runDaily(deps, { budgetMs: 20_000 });
    expect(summary.unfinished).toBe(true);
    expect(pending.size).toBeGreaterThan(0);
    expect(deps.deleteInactiveGuests).not.toHaveBeenCalled();
  });

  it("deletes only guests unused for the whole lifetime", async () => {
    const { deps } = world([]);
    await runDaily(deps);
    const [cutoff] = vi.mocked(deps.deleteInactiveGuests).mock.calls[0];
    expect(cutoff).toBeLessThanOrEqual(1_000_010 - GUEST_LIFETIME);
    expect(cutoff).toBeGreaterThan(1_000_000 - GUEST_LIFETIME - 100);
  });

  it("gives analytics a slot that leaves time for the steps after it, and survives its failure", async () => {
    const { deps } = world([]);
    deps.refreshAnalytics = vi.fn(async (deadline: number) => ({ computed: 5, deadline }));
    const summary = await runDaily(deps, { budgetMs: 30_000 });
    const [deadline] = vi.mocked(deps.refreshAnalytics).mock.calls[0];
    // The budget less the reserve for the later steps (the slot itself is longer than that).
    expect(deadline).toBe(1_000_001 + 30_000 - 8_000);
    expect(summary.analytics).toMatchObject({ computed: 5 });

    deps.refreshAnalytics = vi.fn(async () => {
      throw new Error("service down");
    });
    expect((await runDaily(deps)).analytics).toBe("failed: service down");
  });

  it("sends alert emails after catching up and the analytics' alert check, and survives their failure", async () => {
    const { deps } = world(["a"]);
    const order: string[] = [];
    deps.catchUp = vi.fn(async () => void order.push("catch up"));
    deps.sendAlertEmails = vi.fn(async () => (order.push("emails"), { sent: 2, failed: 0 }));
    deps.refreshAnalytics = vi.fn(async () => (order.push("analytics"), {}));
    expect((await runDaily(deps)).alertEmails).toEqual({ sent: 2, failed: 0 });
    expect(order).toEqual(["catch up", "analytics", "emails"]);
    deps.sendAlertEmails = vi.fn(async () => {
      throw new Error("smtp down");
    });
    expect((await runDaily(deps)).alertEmails).toBe("failed: smtp down");
  });

  it("pushes alerts to devices after the emails, and survives a failure", async () => {
    const { deps } = world(["a"]);
    const order: string[] = [];
    deps.catchUp = vi.fn(async () => void order.push("catch up"));
    deps.sendAlertEmails = vi.fn(async () => (order.push("emails"), {}));
    deps.sendAlertPushes = vi.fn(async () => (order.push("pushes"), { people: 1, sent: 2 }));
    expect((await runDaily(deps)).alertPushes).toEqual({ people: 1, sent: 2 });
    expect(order).toEqual(["catch up", "emails", "pushes"]);
    deps.sendAlertPushes = vi.fn(async () => {
      throw new Error("push service down");
    });
    expect((await runDaily(deps)).alertPushes).toBe("failed: push service down");
  });

  it("gives company numbers a short slot, after analytics, and survives their failure", async () => {
    const { deps } = world([]);
    const order: string[] = [];
    deps.refreshFundamentals = vi.fn(async () => (order.push("fundamentals"), { updated: 4 }));
    deps.refreshAnalytics = vi.fn(async () => (order.push("analytics"), {}));
    const summary = await runDaily(deps, { budgetMs: 50_000 });
    expect(order).toEqual(["analytics", "fundamentals"]);
    expect(summary.fundamentals).toEqual({ updated: 4 });
    const [deadline] = vi.mocked(deps.refreshFundamentals!).mock.calls[0];
    expect(deadline).toBeLessThan(1_000_000 + 10_100);

    deps.refreshFundamentals = vi.fn(async () => {
      throw new Error("sec down");
    });
    expect((await runDaily(deps)).fundamentals).toBe("failed: sec down");
  });
});
