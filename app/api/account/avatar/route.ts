import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { personalData } from "@/lib/db";

/**
 * GET /api/account/avatar?v=…: the signed-in user's own profile picture
 * (lib/profile-actions.ts saves it). Only ever its owner's: there's no user
 * ID in the address, so nobody can look up someone else's.
 *
 * The bytes were checked to be a WebP, JPEG or PNG when saved, and are sent
 * as that type with a policy that runs nothing, so a crafted file can't
 * behave as a page. With the current version in the address, the browser may
 * keep it for a year (a new picture gets a new address); otherwise it asks
 * every time.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const picture = session ? await personalData.avatar(session.user.id) : null;
  if (!picture) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const current = new URL(request.url).searchParams.get("v") === picture.version;
  return new Response(new Uint8Array(picture.data), {
    headers: {
      "Content-Type": picture.type,
      "Content-Length": String(picture.data.length),
      "Cache-Control": current ? "private, max-age=31536000, immutable" : "private, no-cache",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
