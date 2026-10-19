import { auth } from "@/lib/auth";
import { accounts } from "@/lib/db";

/**
 * GET /api/account: the signed-in user's simulated account, as JSON.
 * `account` is null when they don't have one yet (the browser then offers to
 * import guest data). Reads go through this route; changes go through the
 * Server Actions in lib/account-actions.ts.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  const account = await accounts.load(session.user.id);
  // Private, per-user data: never stored by a browser or CDN cache.
  return Response.json({ account }, { headers: { "Cache-Control": "private, no-store" } });
}
