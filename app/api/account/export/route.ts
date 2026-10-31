import { personalData } from "@/lib/db";
import { currentOwner } from "@/lib/owner";
import { allow } from "@/lib/rate-limit";

/**
 * GET /api/account/export: everything MarketLab keeps about this visitor
 * (signed in, or this browser's guest), as a JSON file to download
 * (lib/db/personal-data.ts lists what's in it, and what's left out).
 */
export async function GET() {
  if (!(await allow("export", 5, 60))) {
    return Response.json({ error: "Too many downloads. Wait a minute, then try again." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const owner = await currentOwner({ create: false });
  const data = owner ? await personalData.exportAll(owner.id) : null;
  if (!data) return Response.json({ error: "Nothing is saved for this browser yet." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), about: "Everything MarketLab stores about you. Times are Unix milliseconds unless written as dates.", ...data }, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="marketlab-data-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
