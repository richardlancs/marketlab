import { describe, expect, it } from "vitest";
import { assessHealth, JOB_MAX_AGE, PROFILE_MAX_LAG, type HealthFacts } from "./health";

const NOW = Date.UTC(2026, 9, 21, 12);
const healthy: HealthFacts = {
  now: NOW,
  database: { ok: true },
  analytics: { configured: true, ok: true, version: "1.2.0" },
  market: { latestClose: NOW - 16 * 3_600_000, fallback: false },
  dailyJob: { startedAt: NOW - 14 * 3_600_000, ok: true, unfinished: false },
  newestProfile: NOW - 16 * 3_600_000,
};

describe("assessHealth", () => {
  it("is ok when everything is", () => {
    expect(assessHealth(healthy).status).toBe("ok");
  });

  it("is down when the database, the analytics service or market data fail", () => {
    expect(assessHealth({ ...healthy, database: { ok: false, error: "timeout" } }).status).toBe("down");
    expect(assessHealth({ ...healthy, analytics: { configured: true, ok: false, error: "503" } }).checks.analytics.status).toBe("fail");
    expect(assessHealth({ ...healthy, market: { error: "boom" } }).status).toBe("down");
  });

  it("is down when the daily job failed or hasn't run for too long", () => {
    expect(assessHealth({ ...healthy, dailyJob: { ...healthy.dailyJob!, ok: false } }).checks.dailyJob.status).toBe("fail");
    expect(assessHealth({ ...healthy, dailyJob: { ...healthy.dailyJob!, startedAt: NOW - JOB_MAX_AGE - 1 } }).status).toBe("down");
    // A weekend gap (Friday evening to Monday evening) is fine.
    expect(assessHealth({ ...healthy, dailyJob: { ...healthy.dailyJob!, startedAt: NOW - 72 * 3_600_000 } }).checks.dailyJob.status).toBe("ok");
  });

  it("is only degraded for things the site survives", () => {
    expect(assessHealth({ ...healthy, dailyJob: null }).status).toBe("degraded");
    expect(assessHealth({ ...healthy, dailyJob: { ...healthy.dailyJob!, unfinished: true } }).status).toBe("degraded");
    expect(assessHealth({ ...healthy, market: { latestClose: NOW, fallback: true } }).status).toBe("degraded");
    expect(assessHealth({ ...healthy, analytics: { configured: false } }).status).toBe("degraded");
  });

  it("flags stored analytics that fell behind the latest close", () => {
    expect(assessHealth({ ...healthy, newestProfile: healthy.newestProfile! - PROFILE_MAX_LAG - 1 }).checks.analyticsData.status).toBe("fail");
    expect(assessHealth({ ...healthy, newestProfile: null }).checks.analyticsData.status).toBe("warn");
  });
});
