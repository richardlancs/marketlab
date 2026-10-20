import { backtests } from "@/lib/db";
import { currentOwner } from "@/lib/owner";

/** GET /api/backtests: this visitor's saved backtests (signed in or a guest), newest first. */
export async function GET() {
  const owner = await currentOwner({ create: false });
  return Response.json({ runs: owner ? await backtests.list(owner.id) : [] }, { headers: { "Cache-Control": "private, no-store" } });
}
