import { NextResponse, type NextRequest } from "next/server";
import { STOCK_SYMBOLS } from "@/lib/mock-data";

/**
 * Runs before a /stocks/<symbol> request reaches the page.
 *
 * Why not do this in the page itself? Pages for symbols that weren't
 * pre-rendered start streaming their HTML right away, and once streaming has
 * started the status code is locked at 200. The page would still *show* a
 * redirect or "not found", but browsers and search engines would get the
 * wrong status. Proxy runs first, so it can send the real one.
 */
export function proxy(request: NextRequest) {
  const symbol = decodeURIComponent(request.nextUrl.pathname.split("/")[2] ?? "");
  const canonical = symbol.toUpperCase();

  if (!STOCK_SYMBOLS.includes(canonical)) {
    // Show app/not-found.tsx with a real 404 status. "/_not-found" is the
    // version of it Next.js pre-renders at build, so nothing has to stream.
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }

  if (symbol !== canonical) {
    // One URL per stock: /stocks/aapl → /stocks/AAPL (308 = permanent redirect).
    return NextResponse.redirect(new URL(`/stocks/${canonical}`, request.url), 308);
  }

  return NextResponse.next();
}

export const config = {
  // Only stock pages; everything else (the dashboard, /_next assets…) skips Proxy.
  matcher: "/stocks/:symbol",
};
