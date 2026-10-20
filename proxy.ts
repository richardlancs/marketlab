import { NextResponse, type NextRequest } from "next/server";
import { termForSlug } from "@/lib/lessons/slugs";
import { catalogEntry } from "@/lib/market/catalog";
import { marketMode } from "@/lib/market/mode";
import { isSymbolFormat, normalizeSymbol } from "@/lib/market/symbols";

/**
 * Runs before a /stocks/<symbol> or /learn/<slug> request reaches the page.
 *
 * Why not do this in the page itself? Pages for symbols that weren't
 * pre-rendered start streaming their HTML right away, and once streaming has
 * started the status code is locked at 200. The page would still *show* a
 * redirect or "not found", but browsers and search engines would get the
 * wrong status. Proxy runs first, so it can send the real one.
 *
 * With mock data the catalog is the whole market, so anything else is a real
 * 404 here. That also keeps made-up URLs from each creating a stored page.
 * With Tiingo any real ticker works, and Proxy can't know which exist without
 * spending a request, so it only rejects malformed ones; the page shows "not
 * found" for the rest (with a 200 status, which is fine on a private site).
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/learn/")) return lessonProxy(request);

  let raw: string;
  try {
    raw = decodeURIComponent(request.nextUrl.pathname.split("/")[2] ?? "");
  } catch {
    raw = ""; // malformed %-escapes
  }
  const canonical = normalizeSymbol(raw);
  const exists = isSymbolFormat(canonical) && (marketMode() === "tiingo" || catalogEntry(canonical) !== undefined);

  if (!exists) return notFound(request);

  if (raw !== canonical) {
    // One URL per stock: /stocks/aapl → /stocks/AAPL, /stocks/brk.b → /stocks/BRK-B (308 = permanent redirect).
    return NextResponse.redirect(new URL(`/stocks/${canonical}`, request.url), 308);
  }

  return NextResponse.next();
}

/**
 * Lessons are a fixed list (lib/lessons/slugs.ts), so any other /learn/…
 * address is a real 404, for the same reasons as unknown stocks above.
 */
function lessonProxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.split("/")[2] ?? "";
  return termForSlug(slug) ? NextResponse.next() : notFound(request);
}

/**
 * Shows app/not-found.tsx with a real 404 status. "/_not-found" is the
 * version of it Next.js pre-renders at build, so nothing has to stream.
 */
function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
}

export const config = {
  // Only stock and lesson pages; everything else (the dashboard, /_next assets…) skips Proxy.
  matcher: ["/stocks/:symbol", "/learn/:slug"],
};
