"use server";

/**
 * Server Actions for the portfolio's Review tab (lib/review): the review of
 * the visitor's own trades. It takes no arguments: the account is always
 * the visitor's own, read on the server.
 */
import { allow } from "./rate-limit";
import { loadReview } from "./review/server";
import type { ReviewResult } from "./review/types";

export async function reviewAction(): Promise<{ ok: true; result: ReviewResult } | { ok: false; message: string }> {
  if (!(await allow("review", 6, 60))) return { ok: false, message: "You're refreshing the review a lot. Wait a minute and try again." };
  return loadReview();
}
