/**
 * Counts Tiingo requests so extra tickers can never use up the requests the
 * dashboard needs. The free plan allows 50 requests an hour and 1,000 a day;
 * this stops a little short of both.
 *
 * Core requests (the 13 symbols on the dashboard) always go ahead. Requests
 * for any other ticker only go ahead while there is room left for a full core
 * refresh too. Counts are in memory, so they restart with the server, while
 * Tiingo's own count doesn't: a 429 from Tiingo is the real answer, and
 * `exhaust()` records it until the next hour.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface BudgetLimits {
  hourly: number;
  daily: number;
  /** Kept free in each hour and day for core requests. */
  reserved: number;
}

export const TIINGO_LIMITS: BudgetLimits = { hourly: 45, daily: 900, reserved: 13 };

export function createBudget(limits: BudgetLimits = TIINGO_LIMITS) {
  let hour = { start: 0, used: 0 };
  let day = { start: 0, used: 0 };
  let blockedUntil = 0;

  // Fixed windows: simple, and close enough to how Tiingo counts.
  function roll(now: number) {
    if (now - hour.start >= HOUR) hour = { start: now, used: 0 };
    if (now - day.start >= DAY) day = { start: now, used: 0 };
  }

  return {
    /** Records one request and returns true, or returns false if it shouldn't be sent. */
    take(core: boolean, now: number): boolean {
      roll(now);
      if (now < blockedUntil) return false;
      // Core requests aren't counted against the soft limits: the dashboard matters most, and Tiingo has the final say.
      if (!core && (hour.used >= limits.hourly - limits.reserved || day.used >= limits.daily - limits.reserved)) return false;
      hour.used++;
      day.used++;
      return true;
    },
    /** Tiingo said the limit was reached: send nothing more until the next hour. */
    exhaust(now: number) {
      blockedUntil = now + HOUR;
    },
  };
}

export type Budget = ReturnType<typeof createBudget>;
