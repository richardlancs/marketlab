"use server";

/**
 * Server Actions for the portfolio's Review tab (lib/review): the review of
 * the visitor's own trades, and "Was it luck?" for them. They take no
 * arguments: the account is always the visitor's own, read on the server.
 */
import { allow } from "./rate-limit";
import { loadAccountLuck, loadReview } from "./review/server";
import type { AccountLuck, ReviewResult } from "./review/types";

export async function reviewAction(): Promise<{ ok: true; result: ReviewResult } | { ok: false; message: string }> {
  if (!(await allow("review", 6, 60))) return { ok: false, message: "You're refreshing the review a lot. Wait a minute and try again." };
  return loadReview();
}

export async function accountLuckAction(): Promise<{ ok: true; result: AccountLuck } | { ok: false; message: string }> {
  if (!(await allow("luck", 10, 60))) return { ok: false, message: "You've checked a lot of results. Wait a minute and try again." };
  return loadAccountLuck();
}
