/**
 * Awards the lesson and streak badges a user has earned (lib/badges.ts), from
 * what's in the database. Cheap and safe to run often: run after a lesson is
 * passed or a trade is made, and when the badges are shown, so badges
 * earned before this existed (or as a guest) appear too. Season badges are
 * awarded when a season closes (lib/season-job.ts).
 */
import "server-only";
import { after } from "next/server";
import { lessonBadges, streakBadges } from "./badges";
import { seasons } from "./db";
import { LESSONS } from "./lessons";

/** Streaks are looked for over this many days. */
const STREAK_WINDOW = 120 * 86_400_000;

export async function checkBadges(userId: string, now = Date.now()) {
  const [passed, activity] = await Promise.all([seasons.lessonsPassed(userId), seasons.activity(userId, now - STREAK_WINDOW)]);
  await seasons.award(userId, [...lessonBadges(passed, Object.keys(LESSONS).length), ...streakBadges(activity)], now);
}

/** Checks for new badges once the response has been sent (after a trade or a lesson passed), so it never slows the action down. */
export function checkBadgesLater(userId: string) {
  after(() => checkBadges(userId).catch((error) => console.error("[badges] check failed:", error instanceof Error ? error.message : error)));
}
