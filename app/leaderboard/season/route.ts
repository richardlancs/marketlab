import { seasonIdOf } from "@/lib/seasons";

/**
 * GET /leaderboard/season: this month's season, whichever month it is. The
 * Location is relative, so it stays on whatever origin and scheme was asked.
 */
export function GET() {
  return new Response(null, { status: 307, headers: { Location: `/leaderboard/season/${seasonIdOf(Date.now())}`, "Cache-Control": "no-store" } });
}
