import { learning } from "@/lib/db";
import { currentOwner } from "@/lib/owner";

/**
 * GET /api/learn-progress: this visitor's lesson progress (quiz answers,
 * best scores, passes) and where it's saved: "account" when signed in,
 * "guest" for this browser's guest (or none yet). Changes go through the
 * Server Actions in lib/learn-actions.ts.
 */
export async function GET() {
  const owner = await currentOwner({ create: false });
  const body = { progress: owner ? await learning.load(owner.id) : {}, storage: owner?.kind === "user" ? "account" : "guest" };
  // Private, per-visitor data: never stored by a browser or CDN cache.
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
