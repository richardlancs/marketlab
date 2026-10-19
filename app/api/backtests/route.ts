import { auth } from "@/lib/auth";
import { backtests } from "@/lib/db";

/** GET /api/backtests: the signed-in user's saved backtests, newest first. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json({ runs: await backtests.list(session.user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
