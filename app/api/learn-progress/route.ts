import { currentProgress } from "@/lib/learn-progress";

/**
 * GET /api/learn-progress: this visitor's lesson progress (quiz answers,
 * best scores, passes) and where it's saved: "account" when signed in,
 * "guest" for an anonymous learner cookie (or none yet). Changes go through
 * the Server Actions in lib/learn-actions.ts.
 */
export async function GET() {
  const body = await currentProgress();
  // Private, per-visitor data: never stored by a browser or CDN cache.
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
